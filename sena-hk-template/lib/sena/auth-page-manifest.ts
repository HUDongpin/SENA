export const SENA_ENTERPRISE_PASSWORD_POLICY_MANIFEST = {
  testId: "enterprise-password-policy",
  minLength: 12,
  label: "Enterprise password policy: At least 12 characters with letters and numbers; avoid common passwords and the email name.",
  requirements: ["At least 12 characters", "letters and numbers"]
} as const;

export const SENA_AUTH_PAGE_MANIFEST = {
  login: {
    path: "/login",
    selectors: {
      form: "login-form",
      email: "login-email",
      password: "login-password",
      rememberSession: "login-remember-session",
      submit: "login-submit"
    },
    rememberSession: {
      stateKey: "rememberSession",
      requestBodyField: "rememberSession"
    }
  },
  register: {
    path: "/register",
    selectors: {
      form: "register-form",
      fullName: "register-full-name",
      email: "register-email",
      organization: "register-organization",
      password: "register-password",
      confirmPassword: "register-confirm-password",
      terms: "register-terms",
      submit: "register-submit"
    },
    passwordPolicy: SENA_ENTERPRISE_PASSWORD_POLICY_MANIFEST
  },
  resetPassword: {
    path: "/reset-password",
    passwordPolicy: SENA_ENTERPRISE_PASSWORD_POLICY_MANIFEST
  }
} as const;
