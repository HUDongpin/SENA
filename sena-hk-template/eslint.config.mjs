import nextVitals from "eslint-config-next/core-web-vitals";

const config = [
  ...nextVitals,
  {
    rules: {
      "react-hooks/purity": "off",
      "react-hooks/set-state-in-effect": "off"
    }
  },
  {
    ignores: [
      ".next/**",
      "output/**",
      "vendor/**",
      "vendor/**/dist/**",
      "vendor/**/node_modules/**"
    ]
  }
];

export default config;
