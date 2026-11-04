/**
 * Reading PDFs (pdf.js, src/extract.ts) on synthetic documents printed to PDF by Chromium during the test: text in
 * two columns, citations broken across a line, and a citation split by a page break. The PDFs exist only in memory;
 * no PDF file is stored. Parties and numbers are the invented ones of the fixture index.
 */
import { expect, test, type Browser, type Page } from "@playwright/test";
import { fcaCitation } from "./fixtures/synthetic-index.ts";
import { controlNetwork, dataNotRouted, type Network } from "./network.ts";

const ROWS = "#results tbody tr";

async function printPdf(browser: Browser, body: string): Promise<Buffer> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.setContent(`<!doctype html><html><head><style>body { font: 12pt/1.5 Georgia, serif; margin: 0; }
    p { margin: 0 0 8pt; }</style></head><body>${body}</body></html>`);
  const pdf = await page.pdf({ format: "A4", margin: { top: "20mm", bottom: "20mm", left: "20mm", right: "20mm" } });
  await context.close();
  return pdf;
}

async function openAndUpload(page: Page, name: string, pdf: Buffer): Promise<void> {
  await page.goto("./");
  await expect(page.locator("#coverage table")).toBeVisible();
  await page.locator("#file").setInputFiles({ name, mimeType: "application/pdf", buffer: pdf });
}

async function expectFound(page: Page, numbers: number[]): Promise<void> {
  await expect(page.locator(ROWS)).toHaveCount(numbers.length);
  for (const n of numbers) await expect(page.locator(ROWS).filter({ hasText: `[2019] FCA ${n}` })).toHaveCount(1);
}

function expectCleanNetwork(net: Network): void {
  expect(net.blocked).toEqual([]);
  expect(dataNotRouted(net)).toEqual([]);
}

test("PDF in two columns: every citation is found", async ({ browser, page, context, baseURL }) => {
  const net = await controlNetwork(context, new URL(baseURL!).origin);
  const numbers = [1, 2, 3, 5, 6, 8];
  const paragraphs = numbers.map((n) =>
    `<p>${n}. On this issue the court applied ${fcaCitation(n)} and then turned to the remaining grounds of appeal.</p>`);
  const pdf = await printPdf(browser, `<div style="column-count: 2; column-gap: 12mm">${paragraphs.join("")}</div>`);
  await openAndUpload(page, "two-columns.pdf", pdf);
  await expectFound(page, numbers);
  expectCleanNetwork(net);
});

test("PDF with citations broken across a line: every citation is found", async ({ browser, page, context, baseURL }) => {
  const net = await controlNetwork(context, new URL(baseURL!).origin);
  const [a, b, c] = [fcaCitation(9), fcaCitation(10), fcaCitation(11)];
  const body = [
    `<p>The court applied ${a.replace(" [2019]", "<br>[2019]")} on costs.</p>`, // break before the year
    `<p>It distinguished ${b.replace("[2019] ", "[2019]<br>")} on the facts.</p>`, // break inside the citation
    `<p style="width: 34mm">In a narrow column the court also cited ${c} without comment.</p>`, // natural wrapping
  ].join("");
  await openAndUpload(page, "line-breaks.pdf", await printPdf(browser, body));
  await expectFound(page, [9, 10, 11]);
  expectCleanNetwork(net);
});

test("PDF with a citation split by a page break: it is found", async ({ browser, page, context, baseURL }) => {
  const net = await controlNetwork(context, new URL(baseURL!).origin);
  const citation = fcaCitation(12);
  const cut = citation.indexOf(" FCA");
  const body = `<p>The appellant relied on ${citation.slice(0, cut)}</p>` +
    `<p style="break-before: page">${citation.slice(cut + 1)} for the proposition, without success.</p>`;
  await openAndUpload(page, "page-break.pdf", await printPdf(browser, body));
  await expectFound(page, [12]);
  expectCleanNetwork(net);
});
