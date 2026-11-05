/**
 * Vite dev server for the browser tests (playwright.config.ts starts it on 127.0.0.1) and `npm run dev`. It is the site's own
 * config plus one setting: Vite's file-serving allow-list check rejects every file when the project path contains
 * ":" (this folder's does), answering 403 even for index.html, so the check is switched off here. Both servers bind
 * to 127.0.0.1 only. Builds still use vite.config.ts unchanged.
 */
import { defineConfig, mergeConfig } from "vite";
import base from "../vite.config.ts";

export default mergeConfig(base, defineConfig({ server: { fs: { strict: false } } }));
