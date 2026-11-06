/**
 * Section lists for Commonwealth Acts, from the Federal Register of Legislation API.
 *
 * What leaves the browser: the Act's register id and a date, then a request for one
 * compilation's EPUB. The date is today's, to find the version in force. When an amendment
 * has commenced but its compilation is not yet published, that version has no register id
 * (no text); the date of the day before it began is then sent instead, to find the latest
 * compiled version (DECISIONS.md D047). No document text, citation or party name is sent.
 * The EPUB's table of contents (OEBPS/document.ncx) lists every section, including those in
 * schedules, so a section is checked by looking for its number there.
 */
import { readZipEntry } from "./zip.ts";

export const API = "https://api.prod.legislation.gov.au/v1";

export interface SectionList {
  /** registerId of the compilation read, e.g. "C2026C00405". */
  registerId: string;
  /** Date the version came into force. */
  start: string;
  /**
   * Set when the version in force on the date asked has no compiled text yet: the date from which the uncompiled
   * versions apply. The sections are then those of the latest compiled version before that date.
   */
  uncompiledFrom?: string;
  /** Section numbers in the body of the Act. */
  body: Set<string>;
  /** Section numbers in each schedule, by schedule number ("2" -> {"18", ...}). */
  schedules: Map<string, Set<string>>;
}

/** Parse the EPUB table of contents into section numbers by schedule. */
export function sectionsFromNcx(ncx: string): Omit<SectionList, "registerId" | "start"> {
  const body = new Set<string>();
  const schedules = new Map<string, Set<string>>();
  let current = body;
  for (const m of ncx.matchAll(/<text>([\s\S]*?)<\/text>/g)) {
    const label = m[1]!.replace(/\u00a0/g, " ").replace(/&amp;/g, "&").trim();
    if (/^Endnotes?\b/.test(label)) break; // endnote numbers are not sections
    const sch = /^Schedule\s+(\d+[A-Z]?)\b/.exec(label);
    if (sch) {
      const set = schedules.get(sch[1]!) ?? new Set<string>();
      schedules.set(sch[1]!, set);
      current = set;
      continue;
    }
    const sec = /^(\d+[A-Z]*)\s/.exec(label);
    if (sec) current.add(sec[1]!);
  }
  return { body, schedules };
}

/** The section number a provision refers to: "52(1)(a)" -> "52", "1041H" -> "1041H". */
export function baseSection(section: string): string {
  return /^\d+[A-Z]*/.exec(section.replace(/\s/g, ""))?.[0] ?? section;
}

/** How long each Federal Register request may take, reading included, before the Register counts as unreachable. */
export const REGISTER_TIMEOUT_MS = 8000;

/** The Federal Register could not be reached: a network error, no answer in time, or a server error (HTTP 5xx). */
export class RegisterUnavailable extends Error {
  constructor(detail: string) {
    super(`The Federal Register of Legislation could not be reached (${detail}).`);
    this.name = "RegisterUnavailable";
  }
}

const cache = new Map<string, Promise<SectionList | null>>();

/**
 * Sections of the version in force on `asAt` (YYYY-MM-DD), or null if none is found or its text cannot be read.
 * Rejects with RegisterUnavailable when the Register cannot be reached; that failure is not cached, so the next
 * check tries again.
 */
export function fetchSections(titleId: string, asAt: string, fetchFn: typeof fetch = fetch): Promise<SectionList | null> {
  const key = `${titleId}@${asAt}`;
  if (!cache.has(key)) {
    const loading = load(titleId, asAt, fetchFn);
    cache.set(key, loading);
    loading.catch(() => cache.delete(key));
  }
  return cache.get(key)!;
}

/**
 * How many earlier versions to try when the version in force has no compiled text yet. One is the usual case (an
 * amendment has commenced and its compilation is being prepared); the limit keeps the requests bounded.
 */
export const MAX_UNCOMPILED_STEPS = 3;

/** The day before an ISO date (YYYY-MM-DD). */
function dayBefore(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

async function load(titleId: string, asAt: string, fetchFn: typeof fetch): Promise<SectionList | null> {
  let at = asAt;
  let uncompiledFrom: string | undefined;
  for (let step = 0; step <= MAX_UNCOMPILED_STEPS; step++) {
    const version = await call(fetchFn, `${API}/versions/find(titleid='${encodeURIComponent(titleId)}',asat=${at})`,
      async (r) => (await r.json()) as { registerId?: string | null; start?: string });
    if (!version) return null;
    const start = (version.start ?? "").slice(0, 10);
    if (version.registerId) {
      const epub = await call(fetchFn, `${API}/documents/find(registerId='${encodeURIComponent(version.registerId)}',` +
        "type='Primary',format='Epub',uniqueTypeNumber=0,volumeNumber=0,rectificationVersionNumber=0)",
        async (r) => new Uint8Array(await r.arrayBuffer()));
      if (!epub) return null;
      const ncx = await readZipEntry(epub, "document.ncx");
      if (!ncx) return null;
      return { registerId: version.registerId, start, ...(uncompiledFrom ? { uncompiledFrom } : {}),
        ...sectionsFromNcx(new TextDecoder().decode(ncx)) };
    }
    // This version has commenced but has no compiled text yet: try the version in force the day before it began.
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || start > at) return null;
    uncompiledFrom = start;
    at = dayBefore(start);
  }
  return null;
}

/**
 * One Federal Register request, answered and read within REGISTER_TIMEOUT_MS. A network error, a timeout or an
 * HTTP 5xx rejects with RegisterUnavailable; any other non-OK answer, or a body that cannot be read, gives null.
 */
async function call<T>(fetchFn: typeof fetch, url: string, read: (r: Response) => Promise<T>): Promise<T | null> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new RegisterUnavailable(`no answer within ${REGISTER_TIMEOUT_MS / 1000} s`));
    }, REGISTER_TIMEOUT_MS);
  });
  const answer = (async () => {
    let r: Response;
    try {
      r = await fetchFn(url, { signal: controller.signal });
    } catch (e) {
      throw new RegisterUnavailable(e instanceof Error ? e.message : String(e));
    }
    if (r.status >= 500) throw new RegisterUnavailable(`HTTP ${r.status}`);
    if (!r.ok) return null;
    try {
      return await read(r);
    } catch {
      return null;
    }
  })();
  try {
    return await Promise.race([answer, timeout]);
  } finally {
    clearTimeout(timer);
  }
}
