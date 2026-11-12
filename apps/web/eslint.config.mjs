// Extends the shared root config with browser globals for the web app.
import globals from "globals";
import root from "../../eslint.config.mjs";

export default [
  { ignores: ["dist/**", "public/mockServiceWorker.js"] },
  ...root,
  { languageOptions: { globals: { ...globals.browser } } },
];
