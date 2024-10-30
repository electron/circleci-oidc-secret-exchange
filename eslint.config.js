const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
  js.configs.recommended,
  {
    ignores: ["dist"],
  },
  {
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
];
