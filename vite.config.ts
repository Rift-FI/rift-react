import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import dts from "vite-plugin-dts";
import { resolve } from "node:path";

// The React SDK is a thin npm package that opens the hosted widget in
// an iframe overlay and exposes the auth events via React-native hooks.
// We ship ESM + CJS + .d.ts so it works in every modern toolchain.
export default defineConfig({
  plugins: [
    react(),
    // Generate .d.ts files into dist/ alongside the JS bundles. We
    // point at a dedicated tsconfig that lifts the `noEmit: true` flag
    // that tsconfig.lib.json carries for plain `tsc -b` verification.
    dts({
      tsconfigPath: "./tsconfig.dts.json",
      include: ["src"],
      outDir: "dist",
      entryRoot: "src",
      insertTypesEntry: true,
    }),
  ],
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
