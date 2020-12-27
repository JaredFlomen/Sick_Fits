import React, { Component } from 'react';
import { Mutation } from 'react-apollo';
import gql from 'graphql-tag';
import { CURRENT_USER_QUERY } from './User';
import styled from 'styled-components';

const SIGN_OUT_MUTATION = gql`
  mutation SIGN_OUT_MUTATION {
    signout {
      message
    }
  }
`;

const SIGNOUT_BUTTON = styled.button`
  font-family: 'radnika_next';
`;

const Signout = props => (
  <Mutation 
    mutation={SIGN_OUT_MUTATION}
    refetchQueries={[{
      query: CURRENT_USER_QUERY
    }]}
  >
    {signout => <SIGNOUT_BUTTON onClick={signout}>Sign Out</SIGNOUT_BUTTON>}
  </Mutation>
);
export default Signout;
