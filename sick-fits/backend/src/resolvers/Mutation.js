const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { randomBytes } = require('crypto');
const { promisify } = require('util');
const { transport, makeANiceEmail } = require('../mail');
const { hasPermission } = require('../utils');
const { exists } = require('fs');
const stripe = require('../stripe');

const Mutations = {
  async createItem(parent, args, ctx, info) {
    //Check if they are logged in
    if (!ctx.request.userId) {
      throw new Error('You must be logged in to do that!');
    }
    const item = await ctx.db.mutation.createItem(
      {
        data: {
          // How to create a relationship between the item and the user
          user: {
            connect: {
              id: ctx.request.userId,
            },
          },
          ...args,
        },
      },
      info
    );
    return item;
  },
  updateItem(parent, args, ctx, info) {
    //Check if they are logged in
    if (!ctx.request.userId) {
      throw new Error('You must be logged in to do that!');
    }
    //Checking if the user has proper permissions
    const hasPermissions = ctx.request.user.permissions.some((permission) =>
      ['ADMIN', 'ITEMUPDATE'].includes(permission)
    );
    if (!hasPermissions)
      throw new Error("You don't have permission to do that");
    //Take a copy of the updates
    const updates = { ...args };
    //Remove the ID from the updates
    delete updates.id;
    //Run the update method
    return ctx.db.mutation.updateItem(
      {
        data: updates,
        where: {
          id: args.id,
        },
      },
      info
    );
  },
  async deleteItem(parent, args, ctx, info) {
    //Check if they are logged in
    if (!ctx.request.userId) {
      throw new Error('You must be logged in to do that!');
    }
    const where = { id: args.id };
    //Find the item
    const item = await ctx.db.query.item({ where }, `{ id title user { id }}`);
    //Check if they own the item or have the persmissions
    const ownsItem = item.user.id === ctx.request.userId;
    //Checking if at least one permission is true
    const hasPermissions = ctx.request.user.permissions.some((permission) =>
      ['ADMIN', 'ITEMDELETE'].includes(permission)
    );
    if (!ownsItem || !hasPermissions) {
      throw new Error('You do not have permission to do that!');
    }
    //Delete the item
    return ctx.db.mutation.deleteItem({ where }, info);
  },
  async signup(parent, args, ctx, info) {
    // lowercase their email
    args.email = args.email.toLowerCase();
    // hash their password
    const password = await bcrypt.hash(args.password, 10);
    // create the user in the database
    const user = await ctx.db.mutation.createUser(
      {
        data: {
          ...args,
          password,
          permissions: { set: ['USER'] },
        },
      },
      info
    );
    // create the JWT token for them
    const token = jwt.sign({ userId: user.id }, process.env.APP_SECRET);
    // We set the jwt as a cookie on the response
    ctx.response.cookie('token', token, {
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 24 * 365, // 1 year cookie
    });
    return user;
  },
  async signin(parent, { email, password }, ctx, info) {
    //Check if there is a user with that email
    const user = await ctx.db.query.user({ where: { email: email } });
    if (!user) {
      throw new Error(`No such user found for email ${email}`);
    }
    //Check if their password is correct
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      throw new Error('Invalid Password');
    }
    //Genereate JWT token
    const token = jwt.sign({ userId: user.id }, process.env.APP_SECRET);
    //Set the cookie with the token
    ctx.response.cookie('token', token, {
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 24 * 365, // 1 year cookie
    });
    //Return the user
    return user;
  },
  signout(parent, args, ctx, info) {
    ctx.response.clearCookie('token');
    return { message: 'Goodbye!' };
  },
  async requestReset(parent, args, ctx, info) {
    //Check if this is a real user
    const user = await ctx.db.query.user({ where: { email: args.email } });
    if (!user) {
      throw new Error(`No such user found for email ${args.email}`);
    }
    //Set a reset token and expiry on that user
    const randomBytesPromiseified = promisify(randomBytes);
    const resetToken = (await randomBytesPromiseified(20)).toString('hex');
    const resetTokenExpiry = Date.now() + 3600000; // 1 hour from now
    const res = await ctx.db.mutation.updateUser({
      where: { email: args.email },
      data: { resetToken, resetTokenExpiry },
    });
    //Email them that reset token
    const mailRes = await transport.sendMail({
      from: 'jared@flomen.com',
      to: user.email,
      subject: 'Your Password Reset Token',
      html: makeANiceEmail(`Your Password Reset Token is here!
      \n\n
      <a href="${process.env.FRONTEND_URL}/reset?resetToken=${resetToken}">Click Here to Reset</a>`),
    });

    //Return the message
    return { message: 'Thanks!' };
  },
  async resetPassword(parent, args, ctx, info) {
    //Check if the passwords match
    if (args.password !== args.confirmPassword) {
      throw new Error('Your passwords do not match');
    }
    //Check if it's a legit reset token
    //Check if it's expired
    const [user] = await ctx.db.query.users({
      where: {
        resetToken: args.resetToken,
        resetTokenExpiry_gte: Date.now() - 3600000,
      },
    });
    if (!user) {
      throw new Error('This token is either invalid or expired.');
    }
    //Hash their new password
    const password = await bcrypt.hash(args.password, 10);
    //Save the new password to the user and remove old resetToken fields
    const updatedUser = await ctx.db.mutation.updateUser({
      where: { email: user.email },
      data: {
        password,
        resetToken: null,
        resetTokenExpiry: null,
      },
    });
    //Generate JWT
    const token = jwt.sign({ userId: updatedUser.id }, process.env.APP_SECRET);
    //Set the JWT cookie
    ctx.response.cookie('token', token, {
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 24 * 365,
    });
    //Return the new user
    return updatedUser;
  },
  async updatePermissions(parent, args, ctx, info) {
    //Check if they are logged in
    if (!ctx.request.userId) {
      throw new Error('You must be logged in!');
    }
    //Query the current user
    const currentUser = await ctx.db.query.user(
      {
        where: {
          id: ctx.request.userId,
        },
      },
      info
    );
    //Check if they have permissions to do this
    hasPermission(currentUser, ['ADMIN', 'PERMISSIONUPDATE']);
    //Update the permissions
    return ctx.db.mutation.updateUser(
      {
        data: {
          permissions: {
            set: args.permissions,
          },
        },
        where: {
          id: args.userId,
        },
      },
      info
    );
  },
  async addToCart(parent, args, ctx, info) {
    //Check they are signed in
    const userId = ctx.request.userId;
    if (!userId) {
      throw new Error('You must be signed in!');
    }
    //Query current cart
    const [exisitingCartItem] = await ctx.db.query.cartItems({
      where: {
        user: { id: userId },
        item: { id: args.id },
      },
    });
    //Check if that item is already in their cart and increment by 1 if it is
    if (exisitingCartItem) {
      return ctx.db.mutation.updateCartItem(
        {
          where: { id: exisitingCartItem.id },
          data: { quantity: exisitingCartItem.quantity + 1 },
        },
        info
      );
    }
    //If it's not, create a fresh cart item for that user
    return ctx.db.mutation.createCartItem(
      {
        data: {
          user: {
            connect: { id: userId },
          },
          item: {
            connect: { id: args.id },
          },
        },
      },
      info
    );
  },
  async removeFromCart(parent, args, ctx, info) {
    //Find the cart item
    const cartItem = await ctx.db.query.cartItem(
      {
        where: {
          id: args.id,
        },
      },
      `{id, user { id }}`
    );
    //Make sure we found an item
    if (!cartItem) {
      throw new Error('No cart item Found!');
    }
    //Make sure they own that cart item
    if (cartItem.user.id !== ctx.request.userId) {
      throw new Error('Error! Cheating!');
    }
    //Delete that cart item
    return ctx.db.mutation.deleteCartItem(
      {
        where: {
          id: args.id,
        },
      },
      info
    );
  },
  async createOrder(parent, args, ctx, info) {
    //Query the current user and make sure they are signed in
    const { userId } = ctx.request;
    if (!userId) throw new Error('You must be signed in to complete the order');
    const user = await ctx.db.query.user(
      { where: { id: userId } },
      `{id 
        name 
        email 
        cart {
          id 
          quantity 
          item { title price id description image largeImage }
        }
      }`
    );
    //Recalculate the total for the price
    const amount = user.cart.reduce(
      (tally, cartItem) => tally + cartItem.item.price * cartItem.quantity,
      0
    );
    //Create the stripe charge (turn token in $)
    const charge = await stripe.charges.create({
      amount,
      currency: 'USD',
      source: args.token,
    });
    //Convert the cartItems to orderItems
    const orderItems = user.cart.map((cartItem) => {
      const orderItem = {
        ...cartItem.item,
        quantity: cartItem.quantity,
        user: { connect: { id: userId } },
      };
      delete orderItem.id;
      return orderItem;
    });
    //Create the order
    const order = await ctx.db.mutation.createOrder({
      data: {
        total: charge.amount,
        charge: charge.id,
        items: { create: orderItems },
        user: { connect: { id: userId } },
      },
    });
    //Clear the cart and delete cartItems
    const cartItemIds = user.cart.map((cartItem) => cartItem.id);
    await ctx.db.mutation.deleteManyCartItems({
      where: { id_in: cartItemIds },
    });
    //Return the order to the client
    return order;
  },
};

module.exports = Mutations;
