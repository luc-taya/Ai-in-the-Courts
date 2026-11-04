/**
 * A synthetic index for the browser tests, in the shapes the matcher reads (src/core/match.ts), and a fake
 * Federal Register. Every party, Act, number and address here is invented. Party names are stored as
 * fingerprints made with the shipped fingerprint code, as in the real index. The files are served as plain
 * JSON, ".json.gz" paths included: the page's loader reads bytes without the gzip header as they are
 * (src/loader.ts).
 */
import { fingerprintSides } from "../../src/core/fingerprint.ts";

export const REGISTER_HOST = "api.prod.legislation.gov.au";

/** A token that must never leave the browser. */
export const SENTINEL = "QX7-SENTINEL-ZEBRA-4471";

/** Invented Federal Court decisions of 2019, numbered 1 to 30. Numbers 7 and 13 are gaps in the court-year. */
const FIRST = ["Quenbury", "Halvane", "Ostrel", "Pellowen", "Varnish", "Tremwick", "Ashmere", "Bexholm", "Corvane",
  "Dunmarrow", "Elsby", "Fairmond", "Galvert", "Hartwhistle", "Ingleworth", "Jessamond", "Kilvarrow", "Lomaxen",
  "Merrivale", "Nantwhistle", "Okeford", "Prendlow", "Quaymarsh", "Rushmere", "Stanwick", "Thistlemere", "Upwhistle",
  "Vandermoor", "Whitcombe", "Yarrowby"];
const SECOND = ["Marchbank", "Lindell", "Abernell", "Castellow", "Duvane", "Everholm", "Fenmarrow", "Greswick",
  "Hollowmere", "Iredby", "Jarrowell", "Kestwick", "Lockmere", "Maitholm", "Norwhistle", "Oakvane", "Penrell",
  "Quillmore", "Radwick", "Sherholm", "Tollmere", "Underwick", "Vexmoor", "Wardholm", "Yellmere", "Zanwick",
  "Amblewick", "Brockvane", "Carrowmere", "Delvane"];
const FCA_MAX = 30;
const FCA_GAPS = new Set([7, 13]);
const fcaParties = (n: number) => `${FIRST[n - 1]} v ${SECOND[n - 1]}${n % 4 === 0 ? " Pty Ltd" : ""}`;
/** The parties and citation of invented decision n (1 to 30) as a judge would write them, e.g. for a test PDF. */
export const fcaCitation = (n: number) => `${fcaParties(n)} [2019] FCA ${n}`;

/** Invented CLR reports: [parties, volume, page, year]. */
const CLR: [string, number, number, number][] = [
  ["Corbellow v Dravenholm", 201, 1, 2001], ["Esterwick v Fallowmere", 202, 15, 2002],
  ["Gorsedale v Hembry", 203, 30, 2003], ["Islemont v Jorvane", 204, 45, 2004],
  ["Kettlewell v Lanmoor", 205, 60, 2005], ["Mossvane v Netherby", 206, 75, 2006],
  ["Orchardleigh v Pemberwick", 207, 90, 2007], ["Quarrymead v Rosslyth", 208, 105, 2008],
];

/** An invented Commonwealth Act, with a former name, whose table of contents lists sections 1 to 30. */
export const CTH_ACT = { id: "C2099A00001", registerId: "C2099C00007", name: "Imaginary Commerce Act 2001",
  former: "Pretend Trading Act 1980", sections: 30 };

/** Invented NSW Acts in force at the snapshot: [title, year]. */
const NSW_ACTS: [string, number][] = [["Fictional Fencing Act", 1998], ["Notional Boundaries Act", 2004],
  ["Imagined Waterways Act", 2011], ["Hypothetical Hedges Act", 2016]];

const enc = async (parties: string): Promise<string> =>
  (await fingerprintSides(parties)).map((side) => side.join(" ")).join("|");

/** The index files by path under data/, as the page requests them. */
export async function indexFiles(): Promise<Map<string, unknown>> {
  const files = new Map<string, unknown>();
  files.set("a/index.json", {
    as_at: "2025-03-10", url_prefix: { fixture: "https://decisions.example/" },
    court_years: [{ court: "FCA", year: 2019, n: FCA_MAX - FCA_GAPS.size, max: FCA_MAX, gap: 0.07, src: "fixture" }],
  });
  const r: Record<string, [string, string, string]> = {};
  for (let n = 1; n <= FCA_MAX; n++) {
    if (!FCA_GAPS.has(n)) r[String(n)] = ["2019-03-01", `fca/2019/${n}`, await enc(fcaParties(n))];
  }
  files.set("a/FCA/2019.json.gz", { court: "FCA", year: 2019, max: FCA_MAX, gap: 0.07, src: "fixture", r });
  files.set("b/index.json", { min_citing: 2, series: [{ series: "CLR", key: "CLR", citations: CLR.length }] });
  const reports: Record<string, [number, number, string[]]> = {};
  for (const [parties, volume, page, year] of CLR) reports[`${volume}|${page}`] = [3, year, [await enc(parties)]];
  files.set("b/CLR.json.gz", { series: "CLR", r: reports });
  files.set("c/acts.json.gz", NSW_ACTS.map(([t, y], i) => ({ t, y, j: "NSW", x: 0, u: `https://legislation.example/nsw/${i}` })));
  files.set("d/cth_acts.json.gz", [
    { i: CTH_ACT.id, n: CTH_ACT.name, y: 2001, f: 1, s: "In force", h: [CTH_ACT.former] },
  ]);
  return files;
}

/** The fake Federal Register's answer to "which version is in force" for the invented Act. */
export function registerVersion(): { registerId: string; start: string } {
  return { registerId: CTH_ACT.registerId, start: "2024-07-01T00:00:00" };
}

/** The fake Federal Register's EPUB: a stored zip holding only OEBPS/document.ncx, listing the Act's sections. */
export function registerEpub(): Uint8Array {
  const points = Array.from({ length: CTH_ACT.sections }, (_, i) =>
    `<navPoint><text>${i + 1}\u00a0 Invented provision ${i + 1}</text></navPoint>`).join("");
  return storedZip("OEBPS/document.ncx", `<ncx><navMap>${points}<navPoint><text>Endnotes</text></navPoint></navMap></ncx>`);
}

function storedZip(name: string, content: string): Uint8Array {
  const n = new TextEncoder().encode(name);
  const d = new TextEncoder().encode(content);
  const local = new Uint8Array(30 + n.length + d.length);
  const lv = new DataView(local.buffer);
  lv.setUint32(0, 0x04034b50, true); lv.setUint32(18, d.length, true); lv.setUint32(22, d.length, true);
  lv.setUint16(26, n.length, true); local.set(n, 30); local.set(d, 30 + n.length);
  const central = new Uint8Array(46 + n.length);
  const cv = new DataView(central.buffer);
  cv.setUint32(0, 0x02014b50, true); cv.setUint32(20, d.length, true); cv.setUint32(24, d.length, true);
  cv.setUint16(28, n.length, true); cv.setUint32(42, 0, true); central.set(n, 46);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, 1, true); ev.setUint16(10, 1, true);
  ev.setUint32(12, central.length, true); ev.setUint32(16, local.length, true);
  const out = new Uint8Array(local.length + central.length + end.length);
  out.set(local, 0); out.set(central, local.length); out.set(end, local.length + central.length);
  return out;
}

/** A short private document: the sentinel, a Commonwealth section citation, a decision and a report. */
export function sentinelDocument(): string {
  return [
    `Confidential draft ${SENTINEL}: not for filing.`,
    `The applicant relies on s 12 of the ${CTH_ACT.name} (Cth).`,
    `It also relies on ${fcaParties(2)} [2019] FCA 2 and on ${CLR[0]![0]} (${CLR[0]![3]}) ${CLR[0]![1]} CLR ${CLR[0]![2]}.`,
    `End of the private note ${SENTINEL}.`,
  ].join("\n");
}

/** A document with exactly 50 citations inside the fixture, giving all four result states. */
export function fiftyCitationDocument(): string {
  const lines: string[] = [];
  for (let n = 1; n <= 24; n++) { // 24 decisions: two gaps (no record); every fifth names other parties (mismatch)
    const parties = n % 5 === 0 ? `${FIRST[n - 1]} v ${SECOND[n]}` : fcaParties(n);
    lines.push(`The court considered ${parties} [2019] FCA ${n}.`);
  }
  for (const n of [31, 35]) lines.push(`The court noted ${FIRST[n - 30]} v ${SECOND[n - 30]} [2019] FCA ${n}.`); // above max
  for (const n of [1, 2, 3]) lines.push(`The court noted ${FIRST[n + 2]} v ${SECOND[n + 5]} [2019] VSC ${n}.`); // not covered
  for (const [parties, volume, page, year] of CLR) lines.push(`The court followed ${parties} (${year}) ${volume} CLR ${page}.`);
  lines.push("The court followed Tamberlane v Ulvering (2003) 203 CLR 999."); // in range, not in the report index
  lines.push("The court followed Westmarch v Yondery (2005) 205 CLR 7.");
  for (const s of ["1", "2", "3", "12", "99"]) lines.push(`The applicant relied on s ${s} of the ${CTH_ACT.name} (Cth).`);
  lines.push(`The applicant relied on s 4 of the ${CTH_ACT.former} (Cth).`); // former name
  for (const [t, y] of NSW_ACTS) lines.push(`The applicant relied on s 2 of the ${t} ${y} (NSW).`);
  lines.push("The applicant relied on s 3 of the Unlisted Moorings Act 2001 (NSW)."); // not in the state index
  return lines.join("\n");
}
