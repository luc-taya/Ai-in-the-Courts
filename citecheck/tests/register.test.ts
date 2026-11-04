/**
 * Federal Register outages. Section numbers of Commonwealth Acts are read live (DECISIONS.md D037); when the Register
 * cannot be reached, the result must say so instead of failing quietly. Invented Act ids and dates only.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchSections, REGISTER_TIMEOUT_MS, RegisterUnavailable } from "../src/core/legislation.ts";
import { Checker, DEFAULTS, type Loader } from "../src/core/match.ts";
import { parseCitations } from "../src/core/parse.ts";

const ACT_ID = "C2099A00042";
const loader: Loader = {
  json: async () => null,
  gzJson: async <T>(path: string) =>
    (path === "d/cth_acts.json.gz" ? [{ i: ACT_ID, n: "Invented Registers Act 2003", y: 2003, f: 1, s: "In force", h: [] }] : null) as T,
};

const answering = (code: number) => (async () => new Response("", { status: code })) as unknown as typeof fetch;
const throwing = (async () => {
  throw new TypeError("Failed to fetch");
}) as unknown as typeof fetch;
const hanging = (() => new Promise<Response>(() => {})) as unknown as typeof fetch;

afterEach(() => {
  vi.useRealTimers();
});

describe("fetchSections when the Federal Register is down", () => {
  it("rejects with RegisterUnavailable on HTTP 503", async () => {
    await expect(fetchSections(ACT_ID, "2031-01-01", answering(503))).rejects.toBeInstanceOf(RegisterUnavailable);
  });

  it("rejects with RegisterUnavailable when the request throws", async () => {
    await expect(fetchSections(ACT_ID, "2031-01-02", throwing)).rejects.toBeInstanceOf(RegisterUnavailable);
  });

  it("rejects with RegisterUnavailable once the time limit passes with no answer", async () => {
    vi.useFakeTimers();
    let settled = false;
    const pending = fetchSections(ACT_ID, "2031-01-03", hanging);
    pending.then(() => (settled = true), () => (settled = true));
    await vi.advanceTimersByTimeAsync(REGISTER_TIMEOUT_MS - 1);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await expect(pending).rejects.toBeInstanceOf(RegisterUnavailable);
  });

  it("treats HTTP 404 as no version found, not as an outage", async () => {
    await expect(fetchSections(ACT_ID, "2031-01-04", answering(404))).resolves.toBeNull();
  });

  it("does not remember an outage: the next check asks again", async () => {
    let calls = 0;
    const down = (async () => {
      calls++;
      return new Response("", { status: 503 });
    }) as unknown as typeof fetch;
    await expect(fetchSections(ACT_ID, "2031-01-05", down)).rejects.toBeInstanceOf(RegisterUnavailable);
    await expect(fetchSections(ACT_ID, "2031-01-05", down)).rejects.toBeInstanceOf(RegisterUnavailable);
    expect(calls).toBe(2);
  });
});

describe("a Commonwealth section citation when the Federal Register is down", () => {
  const check = async (fetchFn: typeof fetch, asAt: string) => {
    const [citation] = parseCitations("s 5 of the Invented Registers Act 2003 (Cth)");
    return new Checker(loader, { ...DEFAULTS, asAt, fetchFn }).check(citation!);
  };

  it("keeps its state, is marked, and says the sections were not checked (HTTP 503)", async () => {
    const r = await check(answering(503), "2031-02-01");
    expect(r.state).toBe("FOUND");
    expect(r.registerUnreachable).toBe(true);
    expect(r.reason).toMatch(/could not be reached, so section numbers were not checked/);
  });

  it("is marked after a thrown error", async () => {
    expect((await check(throwing, "2031-02-02")).registerUnreachable).toBe(true);
  });

  it("is not marked when the Register answers 404", async () => {
    const r = await check(answering(404), "2031-02-03");
    expect(r.registerUnreachable).toBeUndefined();
    expect(r.reason).toMatch(/current text could not be read/);
  });
});
