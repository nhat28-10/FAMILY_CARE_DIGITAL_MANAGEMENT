/** Quy tắc mật khẩu mạnh dùng chung cho register / reset password. */
export const PASSWORD_REGEX =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,}$/;

export const PASSWORD_RULE =
  'Password must be at least 8 characters long and include at least one uppercase letter, one lowercase letter, one number and one special character';
