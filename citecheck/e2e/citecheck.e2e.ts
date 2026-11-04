/**
 * The three promises the CiteCheck AU page makes, checked in a real browser (Chromium) against the synthetic
 * fixture index in e2e/fixtures: no document text leaves the browser; offline mode stays on the site's origin;
 * 50 citations are checked in under 3 s from a cold start. Every party, Act and number is invented.
 */
import { expect, test, type Page } from "@playwright/test";
import { fiftyCitationDocument, SENTINEL, sentinelDocument } from "./fixtures/synthetic-index.ts";
import { carried, controlNetwork, dataNotRouted, type Network } from "./network.ts";

const ROWS = "#results tbody tr";
const originOf = (baseURL: string | undefined) => new URL(baseURL!).origin;

async function openPage(page: Page): Promise<void> {
  await page.goto("./");
  await expect(page.locator("#coverage table")).toBeVisible(); // the page has loaded its coverage table
}

/** Every 20-character piece of the text. */
function pieces(text: string, size = 20): string[] {
  const out = new Set<string>();
  for (let i = 0; i + size <= text.length; i++) out.add(text.slice(i, i + size));
  return [...out];
}

function expectCleanNetwork(net: Network): void {
  expect(net.blocked, "requests to other sites").toEqual([]);
  expect(dataNotRouted(net), "index requests that reached the server").toEqual([]);
  expect(net.dataMissing, "index files the fixture lacks").toEqual([]);
}

test("no document text in any request", async ({ page, context, baseURL }) => {
  const net = await controlNetwork(context, originOf(baseURL));
  await openPage(page);
  const doc = sentinelDocument();
  await page.locator("#text").fill(doc);
  await page.locator("#run").click();
  await expect(page.locator(ROWS)).toHaveCount(3);
  // The Commonwealth section check really went out (to the fake Federal Register) and came back.
  await expect(page.locator(ROWS).filter({ hasText: "Imaginary Commerce Act 2001" })).toContainText("as in force on");
  expect(net.register.length).toBeGreaterThan(0);

  const parts = pieces(doc);
  const leaks = net.requests.map(carried).filter((c) =>
    c.toLowerCase().includes(SENTINEL.toLowerCase()) || parts.some((p) => c.includes(p)));
  expect(leaks).toEqual([]);
  expectCleanNetwork(net);
});

test("offline mode stays on the site's origin", async ({ page, context, baseURL }) => {
  const origin = originOf(baseURL);
  const net = await controlNetwork(context, origin);
  const sockets: string[] = [];
  page.on("websocket", (ws) => sockets.push(ws.url()));
  await openPage(page);
  await page.getByLabel("Offline mode: contact no other site").check(); // the label states what this test proves
  await page.locator("#text").fill(sentinelDocument());
  await page.locator("#run").click();
  await expect(page.locator(ROWS)).toHaveCount(3);
  await expect(page.locator(ROWS).filter({ hasText: "Imaginary Commerce Act 2001" }))
    .toContainText("Section numbers were not checked (offline mode)");

  const elsewhere = net.requests.map((r) => r.url()).filter((u) => new URL(u).origin !== origin);
  expect(elsewhere).toEqual([]);
  expect(net.requests.filter((r) => new URL(r.url()).hostname.endsWith("legislation.gov.au"))).toHaveLength(0);
  expect(net.register).toEqual([]);
  // The Vite dev server's reload channel is a WebSocket to the same host and port; the deployed site has none.
  expect(sockets.filter((s) => new URL(s).host !== new URL(origin).host)).toEqual([]);
  expectCleanNetwork(net);
});

test("50 citations in under 3 s from cold start", async ({ browser, baseURL }) => {
  // Cold start: a new browser context (empty cache) and a freshly loaded page. The fixture index is served by
  // route, so network latency is excluded: this times the page's own parsing, index reading and matching
  // (LUC-TODO P1-19 records this).
  const context = await browser.newContext({ baseURL });
  const net = await controlNetwork(context, originOf(baseURL));
  const page = await context.newPage();
  await openPage(page);
  await page.locator("#text").fill(fiftyCitationDocument());

  const started = Date.now();
  await page.locator("#run").click();
  await page.waitForFunction((n) => document.querySelectorAll("#results tbody tr").length === n, 50);
  const elapsed = Date.now() - started;
  console.log(`50 citations checked in ${elapsed} ms (from clicking Check to all results shown)`);
  test.info().annotations.push({ type: "timing", description: `${elapsed} ms` });
  expect(elapsed).toBeLessThan(3000);

  await expect(page.locator("#status")).toContainText("50 citations checked");
  for (const label of ["Found", "Name–citation mismatch", "No record", "Cannot check"]) {
    await expect(page.locator("#summary")).toContainText(label);
  }
  expect(net.register.length).toBeGreaterThan(0);
  expectCleanNetwork(net);
  await context.close();
});
