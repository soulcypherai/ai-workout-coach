import { sentryVitePlugin } from "@sentry/vite-plugin";
import react from "@vitejs/plugin-react";
import path from "path";
import { defineConfig } from "vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    sentryVitePlugin({
      authToken: process.env.SENTRY_AUTH_TOKEN,
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      disable: process.env.NODE_ENV !== "production", // Only upload in production
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    minify: false,
  },
  server: {
    port: 3004,
    allowedHosts: ["um-counties-palestine-vbulletin.trycloudflare.com"],
  },
  assetsInclude: ["**/*.mkv", "**/*.mp4", "**/*.webm"],
  define: {
    "process.env": {},
  },
});
