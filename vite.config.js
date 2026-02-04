const { defineConfig } = require("vite");
const electron = require("vite-plugin-electron").default;
const renderer = require("vite-plugin-electron-renderer").default;
const { viteStaticCopy } = require("vite-plugin-static-copy");
const path = require("path");

module.exports = defineConfig({
  root: path.join(__dirname, "src"),
  plugins: [
    electron([
      {
        entry: path.resolve(__dirname, "src/main.js"),
        vite: {
          build: {
            outDir: path.resolve(__dirname, "dist"),
            rollupOptions: {
              // We tell Vite: If a require starts with "./", don't bundle it!
              external: [
                "electron",
                "electron-store",
                "axios",
                /^\.\//, // This regex matches any local file import
                /^\.\.\//, // Matches parent directory imports
              ],
            },
          },
        },
      },
      {
        entry: path.resolve(__dirname, "src/preload.js"),
        vite: {
          build: { outDir: path.resolve(__dirname, "dist") },
        },
      },
    ]),
    renderer(),
    viteStaticCopy({
      targets: [
        // This physically moves the files so the 'external' require finds them
        { src: "../src/*.js", dest: "." },
        { src: "../src/assets", dest: "." },
        { src: "../src/db", dest: "." },
        { src: "../src/middleware", dest: "." },
        { src: "../src/util", dest: "." },
      ],
    }),
  ],
  build: {
    outDir: path.resolve(__dirname, "dist"),
    emptyOutDir: true,
  },
});
