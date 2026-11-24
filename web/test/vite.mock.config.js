import { defineConfig } from "vite";
const m = new URL("./mock-firebase.js", import.meta.url).pathname;
export default defineConfig({
  root: new URL("..", import.meta.url).pathname,
  resolve: { alias: { "firebase/app": m, "firebase/app-check": m, "firebase/ai": m } },
  define: { "import.meta.env.VITE_FIREBASE_API_KEY": '"x"', "import.meta.env.VITE_FIREBASE_APP_ID": '"x"' },
});
