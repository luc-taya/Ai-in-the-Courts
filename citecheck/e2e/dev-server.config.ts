/**
 * Vite dev server for the browser tests only (playwright.config.ts starts it on 127.0.0.1). It is the site's own
 * config plus one setting: Vite's file-serving allow-list check rejects every file when the project path contains
 * ":" (this folder's does), answering 403 even for index.html, so the check is switched off here. Builds and
 * `npm run dev` still use vite.config.ts unchanged.
 */
import { defineConfig, mergeConfig } from "vite";
import base from "../vite.config.ts";

export default mergeConfig(base, defineConfig({ server: { fs: { strict: false } } }));
