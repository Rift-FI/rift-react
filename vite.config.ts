import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import dts from "vite-plugin-dts";
import { resolve } from "node:path";

// The React SDK is a thin npm package that opens the hosted widget in
// an iframe overlay and exposes the auth events via React-native hooks.
// We ship ESM + CJS + .d.ts so it works in every modern toolchain.
export default defineConfig({
  plugins: [react(), dts({ include: ["src"] })],
  build: {
    lib: {
      entry: resolve(__dirname, "src/index.ts"),
      name: "RiftReact",
      formats: ["es", "cjs"],
      fileName: (format) => (format === "es" ? "rift-react.js" : "rift-react.cjs"),
    },
    rollupOptions: {
      external: ["react", "react-dom", "react/jsx-runtime"],
      output: {
        globals: {
          react: "React",
          "react-dom": "ReactDOM",
        },
      },
    },
    sourcemap: true,
    target: "es2020",
  },
});
