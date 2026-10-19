import { createApplication } from "./app.js";
const env = {
  document,
  localStorage: {
    getItem: (...args) => window.localStorage.getItem(...args),
    setItem: (...args) => window.localStorage.setItem(...args),
    removeItem: (...args) => window.localStorage.removeItem(...args),
  },
  location,
  window,
  Blob,
  URL,
  alert: (...args) => window.alert(...args),
  confirm: (...args) => window.confirm(...args),
  prompt: (...args) => window.prompt(...args),
  setTimeout: (...args) => window.setTimeout(...args),
};
const app = createApplication({ env });
app.bindEvents();
app.init();
