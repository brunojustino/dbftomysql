const { defineConfig, loadEnv } = require("vite");
const electron = require("vite-plugin-electron").default;
const renderer = require("vite-plugin-electron-renderer").default;
const { viteStaticCopy } = require("vite-plugin-static-copy");
const path = require("path");

module.exports = defineConfig(({ mode }) => {
  // Load variables from .env based on the current mode (development/production)
  const env = loadEnv(mode, process.cwd());
  process.env.VITE_DB_HOST = env.VITE_DB_HOST;
  process.env.VITE_DB_USER = env.VITE_DB_USER;
  process.env.VITE_DB_PASS = env.VITE_DB_PASS;
  process.env.VITE_DB_PORT = env.VITE_DB_PORT;
  process.env.VITE_DB_NAME = env.VITE_DB_NAME;

  return {
    root: path.join(__dirname, "src"),
    plugins: [
      electron([
        {
          entry: path.resolve(__dirname, "src/main.js"),
          vite: {
            define: {
              "process.env.VITE_DB_HOST": JSON.stringify(env.VITE_DB_HOST),
              "process.env.VITE_DB_USER": JSON.stringify(env.VITE_DB_USER),
              "process.env.VITE_DB_PASS": JSON.stringify(env.VITE_DB_PASS),
              "process.env.VITE_DB_PORT": JSON.stringify(env.VITE_DB_PORT),
              "process.env.VITE_DB_NAME": JSON.stringify(env.VITE_DB_NAME),
            },
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
  };
});
