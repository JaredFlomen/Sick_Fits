import Reset from '../components/Reset';

const ResetPassword = props => (
  <div>
    <p>Reset Your Password {props.query.resetToken}</p>
    <Reset resetToken={props.query.resetToken}/>
  </div>
)

export default ResetPassword;