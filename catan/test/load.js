// Loads the game script out of index.html into a fresh vm context (no DOM).
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

module.exports = function loadGame() {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const m = html.match(/<script>([\s\S]*?)<\/script>/);
  if (!m) throw new Error('no <script> block in index.html');
  const ctx = { module: { exports: {} }, console };
  vm.createContext(ctx);
  vm.runInContext(m[1], ctx, { filename: 'index.html#script' });
  return ctx.module.exports;
};
