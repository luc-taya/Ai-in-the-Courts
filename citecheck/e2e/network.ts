/**
 * Network control for the browser tests. Every request a test's browser context makes passes through here:
 *  - the site's own index files (/citecheck/data/...) are answered from the synthetic fixture and never reach
 *    the dev server;
 *  - the Federal Register API is answered by a fake (fixtures/synthetic-index.ts);
 *  - other requests to the page's own origin (the page and its code) go to the Vite dev server;
 *  - anything else is aborted and recorded, so no test can reach another site (AustLII, NSW Caselaw or any other).
 */
import type { BrowserContext, Request, Route } from "@playwright/test";
import { indexFiles, REGISTER_HOST, registerEpub, registerVersion } from "./fixtures/synthetic-index.ts";

export interface Network {
  origin: string;
  /** Every request the context issued, in order, whatever happened to it. */
  requests: Request[];
  /** Index-file paths answered from the fixture. */
  dataRouted: string[];
  /** Index-file paths the fixture does not have (answered 404, as a missing file would be). */
  dataMissing: string[];
  /** Requests answered by the fake Federal Register. */
  register: string[];
  /** Other requests that left the page's origin: aborted. */
  blocked: string[];
}

const DATA = /^\/citecheck\/data\/(.+)$/;
const CORS = { "access-control-allow-origin": "*" };

export async function controlNetwork(context: BrowserContext, origin: string): Promise<Network> {
  const files = await indexFiles();
  const net: Network = { origin, requests: [], dataRouted: [], dataMissing: [], register: [], blocked: [] };
  context.on("request", (r) => net.requests.push(r));
  await context.route("**/*", async (route: Route) => {
    const url = new URL(route.request().url());
    if (url.origin === origin) {
      const data = DATA.exec(url.pathname);
      if (!data) return route.continue();
      const path = data[1]!;
      net.dataRouted.push(url.pathname);
      const body = files.get(path);
      if (body === undefined) {
        net.dataMissing.push(path);
        return route.fulfill({ status: 404, body: "" });
      }
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
    }
    if (url.hostname === REGISTER_HOST) {
      net.register.push(url.href);
      if (url.pathname.includes("/versions/find(")) {
        return route.fulfill({ status: 200, headers: CORS, contentType: "application/json", body: JSON.stringify(registerVersion()) });
      }
      if (url.pathname.includes("/documents/find(")) {
        return route.fulfill({ status: 200, headers: CORS, contentType: "application/epub+zip", body: Buffer.from(registerEpub()) });
      }
      return route.fulfill({ status: 404, headers: CORS, body: "" });
    }
    net.blocked.push(url.href);
    return route.abort("blockedbyclient");
  });
  return net;
}

/** Index-file requests the context issued that the fixture route did not answer, so they reached the server. */
export function dataNotRouted(net: Network): string[] {
  const routed = [...net.dataRouted];
  const missed: string[] = [];
  for (const r of net.requests) {
    const url = new URL(r.url());
    if (url.origin !== net.origin || !DATA.test(url.pathname)) continue;
    const i = routed.indexOf(url.pathname);
    if (i === -1) missed.push(url.pathname);
    else routed.splice(i, 1);
  }
  return missed;
}

/** Everything a request carries that could hold document text: its URL (also decoded), headers and body. */
export function carried(r: Request): string {
  let decoded = r.url();
  try {
    decoded = decodeURIComponent(r.url());
  } catch {
    // keep the raw URL
  }
  const headers = Object.entries(r.headers()).map(([k, v]) => `${k}: ${v}`).join("\n");
  return [r.url(), decoded, headers, r.postData() ?? ""].join("\n");
}
