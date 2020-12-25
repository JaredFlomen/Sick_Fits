// Startup the server
const cookiePerser = require('cookie-parser');
require('dotenv').config({ path: 'variables.env' });
const createServer = require('./createServer');
const db = require('./db')

const server = createServer();

//Use express middleware to handle cookies (JWT) and to populate current user
server.express.use(cookiePerser());

server.start({
  cors: {
    credentials: true,
    origin: process.env.FRONTEND_URL,
  },
}, deets => {
  console.log(`Server is now running on port http://localhost:${deets.port}`)
})