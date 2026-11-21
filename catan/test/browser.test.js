// Loads index.html in headless Chromium and plays the human's setup and first turn.
// Run: node --test catan/test/browser.test.js   (needs Playwright + Chromium; skipped otherwise)
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');

let chromium = null;
try { ({ chromium } = require('playwright')); } catch (e) { /* skipped below */ }
const EXE = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium';

test('index.html renders and is playable in Chromium with no console errors', { skip: !chromium && 'playwright not installed', timeout: 90000 }, async () => {
  const launch = { args: ['--no-sandbox'], headless: true };
  if (fs.existsSync(EXE) && fs.statSync(EXE).isFile()) launch.executablePath = EXE;
  const browser = await chromium.launch(launch);
  const errors = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', e => errors.push(String(e)));
    await page.goto('file://' + path.join(__dirname, '..', 'index.html'));

    assert.strictEqual(await page.locator('#board polygon.hex').count(), 19);
    assert.strictEqual(await page.locator('#board text.portlbl').count(), 9);
    assert.strictEqual(await page.locator('#players .pl').count(), 4);
    await page.selectOption('#selSpeed', 'fast');

    // Setup: human places settlement + road, twice (bots fill in between).
    for (let round = 0; round < 2; round++) {
      await page.locator('#board circle.target[data-vert]').first().waitFor({ timeout: 20000 });
      await page.locator('#board circle.target[data-vert]').first().click();
      await page.locator('#board g.edge-target').first().waitFor();
      await page.locator('#board g.edge-target').first().click();
    }
    // Human's first turn.
    await page.waitForSelector('#btnRoll:not([disabled])', { timeout: 20000 });
    await page.click('#btnRoll');
    for (let i = 0; i < 10 && !(await page.isEnabled('#btnEnd')); i++) {
      if (await page.locator('#modal:not([hidden])').count()) {
        // discard: press + until the confirm button enables
        while (await page.locator('#modal button[data-act="dok"][disabled]').count()) await page.locator('#modal button[data-act="dinc"]:not([disabled])').first().click();
        await page.click('#modal button[data-act="dok"]');
      } else if (await page.locator('#board polygon.hex-target').count()) {
        await page.locator('#board polygon.hex-target').first().click();
      } else if (await page.locator('#prompt button[data-act="steal"]').count()) {
        await page.locator('#prompt button[data-act="steal"]').first().click();
      }
      await page.waitForTimeout(100);
    }
    // Build mode toggles and Esc cancels.
    if (await page.isEnabled('#btnRoad')) {
      await page.click('#btnRoad');
      assert.ok(await page.locator('#board g.edge-target').count() > 0);
      await page.keyboard.press('Escape');
      assert.strictEqual(await page.locator('#board g.edge-target').count(), 0);
    }
    await page.click('#btnEnd');
    // Let the bots play a full round.
    await page.waitForSelector('#btnRoll:not([disabled]), #overlay:not([hidden]), #modal:not([hidden]), #prompt button', { timeout: 30000 });
    assert.ok((await page.locator('#log div').count()) > 10);
    await page.screenshot({ path: path.join(__dirname, 'screenshot.png') });
  } finally {
    await browser.close();
  }
  assert.deepStrictEqual(errors, []);
});
