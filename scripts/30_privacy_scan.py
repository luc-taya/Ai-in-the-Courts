"""Count-only privacy scan for self-represented parties' case titles (PRIVACY.md B1 and C1; D022).

Names come from the two gitignored name files: data/interim/tracker_full.csv (titles as published) and
data/interim/au_cases.csv (Charlotin's case names). A row counts as self-represented under the rule the
tracker build uses to withhold titles (scripts/12_build_tracker.py, scripts/15_build_site.py): our
extraction's party_type is self_represented, or Charlotin's coding is "Pro Se Litigant", or the public
data/tracker.csv withholds the row's title.

Text is compared after folding case, accents, punctuation and whitespace, so "v" and "v." are the same.
  title     a full case title (with and without a trailing "(No 2)"; citations after the title dropped);
  pair      a party pair: the first side's last party word within 4 words before "v", and a party word of
            the other side within 6 words after it (this also covers titles against a State or a Minister);
  possible  two or more words of one person's name in a row, for a person to look at: never a failure.

Scope: text files from `git ls-files`, minus every path under eval/ (Luc only). Those paths are dropped
from the list before any file is opened, and the scan prints "eval/ not scanned (Luc only)".
  --also DIR    also scan the text files under DIR (used for the agents' workspace); repeatable
  --log RANGE   also scan the commit messages in a git range, e.g. c161ae5..HEAD

Output is counts, file paths and line numbers only, never a name. Luc's checked-value files
(data/review/*, aic/impugned.py, aic/flags.py) are reported on their own "LUC-CHECKED" line. Exit 1 on any
title or pair hit elsewhere, 0 otherwise. Without the name files (CI, a fresh clone) the scan is skipped
and exits 0.

    $PY scripts/30_privacy_scan.py [--also DIR] [--log RANGE]
"""

import argparse
import csv
import re
import subprocess
import sys
import unicodedata
from collections.abc import Iterable
from dataclasses import dataclass, field
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FULL = "data/interim/tracker_full.csv"
CASES = "data/interim/au_cases.csv"
PUBLIC = "data/tracker.csv"
EVAL_DIR = "eval"
EVAL_LINE = "eval/ not scanned (Luc only)"
SKIP_LINE = "skipped: name files not present"
LUC_CHECKED = ("data/review/", "aic/impugned.py", "aic/flags.py")
LUC_LABEL = "LUC-CHECKED (agents may not edit)"
SKIP_DIRS = {".git", "node_modules", "__pycache__", ".pytest_cache", ".ruff_cache"}

# Words that never identify a party on their own.
STOP = {"the", "of", "and", "for", "in", "re", "matter", "ex", "parte", "anor", "ors", "another", "others",
        "pty", "ltd", "limited", "inc", "co", "no", "mr", "ms", "mrs", "miss", "dr", "as", "by", "an", "on",
        "behalf", "trustee", "applicant", "respondent", "appellant", "plaintiff", "defendant", "application",
        "appeal", "v"}
# Words of government and organisation names: not used as the other side's party word unless nothing else is
# left (so a title against a Minister still gives a pair), and never part of a "possible" personal name.
GENERIC = {"state", "minister", "commonwealth", "australia", "australian", "department", "director", "secretary",
           "commissioner", "chief", "executive", "officer", "council", "registrar", "deputy", "attorney", "general",
           "public", "prosecutions", "police", "service", "services", "authority", "commission", "tribunal",
           "court", "bank", "insurance", "group", "holdings", "company", "corporation", "home", "affairs",
           "immigration", "citizenship", "multicultural", "border", "protection", "health", "education",
           "university", "board", "union", "association", "trust", "office", "national", "federal", "city",
           "shire", "local", "government", "crown", "queen", "king", "regina", "rex", "r", "body", "corporate",
           "owners", "strata", "plan", "agency", "industrial", "relations", "workers", "compensation"}
PLACES = {"nsw", "new", "south", "wales", "victoria", "queensland", "western", "tasmania", "northern",
          "territory", "capital", "act", "sa", "wa", "qld", "vic", "tas", "nt"}
ORG = GENERIC | PLACES | {"pty", "ltd", "limited", "inc", "co"}

_CITATION = re.compile(r"\s*(?:\[\d{4}\]|\(\d{4}\)).*$", re.S)
_NUMBERED = re.compile(r"\s*\(\s*no\.?\s*\d+\s*\)\s*$", re.I)
_WORD = re.compile(r"[a-z0-9]+")


def tokens(text: str) -> list[str]:
    """Lower-case words with accents, punctuation and whitespace folded away ("v." and "vs" become "v")."""
    text = unicodedata.normalize("NFKD", text)
    text = "".join(ch for ch in text if not unicodedata.combining(ch)).lower().replace("&", " and ")
    return ["v" if w == "vs" else w for w in _WORD.findall(text)]


def _identifying(word: str) -> bool:
    return len(word) >= 2 and word not in STOP and not word.isdigit()


@dataclass
class Patterns:
    titles: dict[str, set[tuple[str, ...]]] = field(default_factory=dict)  # first word -> word sequences
    pairs: dict[str, set[frozenset[str]]] = field(default_factory=dict)  # first side's word -> other side's words
    possible: dict[str, set[tuple[str, ...]]] = field(default_factory=dict)

    def add(self, name: str) -> None:
        base = _CITATION.sub("", name).strip()
        for variant in {base, _NUMBERED.sub("", base).strip()}:
            words = tokens(variant)
            if len(words) >= 2 and any(len(w) >= 3 and _identifying(w) for w in words):
                self.titles.setdefault(words[0], set()).add(tuple(words))
            if "v" in words:
                cut = words.index("v")
                sides = [words[:cut], words[cut + 1:]]
                a = [w for w in sides[0] if _identifying(w)]
                b = [w for w in sides[1] if _identifying(w)]
                keys = [w for w in b if w not in GENERIC] or b[:1]
                if a and keys:
                    self.pairs.setdefault(a[-1], set()).add(frozenset(keys))
            else:
                sides = [words]
            for side in sides:
                person = [w for w in side if _identifying(w)]
                if len(person) >= 2 and not any(w in ORG for w in side):
                    for run in {tuple(person), (person[0], person[-1])}:
                        self.possible.setdefault(run[0], set()).add(run)


def scan_lines(lines: Iterable[str], pat: Patterns) -> dict[str, set[int]]:
    """Line numbers of title, pair and possible hits. Matches may run across line breaks."""
    words: list[str] = []
    line_of: list[int] = []
    for n, line in enumerate(lines, 1):
        for w in tokens(line):
            words.append(w)
            line_of.append(n)
    hits: dict[str, set[int]] = {"title": set(), "pair": set(), "possible": set()}
    covered: set[int] = set()
    for i, w in enumerate(words):
        for seq in pat.titles.get(w, ()):
            if tuple(words[i:i + len(seq)]) == seq:
                hits["title"].add(line_of[i])
                covered.update(line_of[i:i + len(seq)])
        for seq in pat.possible.get(w, ()):
            if tuple(words[i:i + len(seq)]) == seq:
                hits["possible"].add(line_of[i])
        if w == "v":
            after = set(words[i + 1:i + 7])
            if any(keys & after for a in words[max(0, i - 4):i] for keys in pat.pairs.get(a, ())):
                hits["pair"].add(line_of[i])
    hits["pair"] -= covered
    hits["possible"] -= covered | hits["pair"]
    return hits


def _read_csv(path: Path) -> list[dict[str, str]]:
    with path.open(newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def load_names(root: Path) -> tuple[list[str], int] | None:
    """Self-represented parties' titles and case names, and the number of rows; None without the name files."""
    full_path, cases_path, public_path = root / FULL, root / CASES, root / PUBLIC
    if not full_path.exists() and not cases_path.exists():
        return None
    withheld = set()
    if public_path.exists():
        withheld = {r["id"] for r in _read_csv(public_path) if r.get("title_withheld", "").strip()}
    rows: set[str] = set()
    names: list[str] = []
    if full_path.exists():
        for r in _read_csv(full_path):
            if (r.get("party_type") == "self_represented" or r.get("charlotin_party_type") == "Pro Se Litigant"
                    or r.get("id") in withheld):
                rows.add(r.get("charlotin_row", ""))
                names.append(r.get("title_as_published", ""))
    if cases_path.exists():
        for r in _read_csv(cases_path):
            if r.get("charlotin_row") in rows or r.get("Party(ies)") == "Pro Se Litigant":
                rows.add(r.get("charlotin_row", ""))
                names.append(r.get("Case Name", ""))
    return [n for n in names if n.strip()], len(rows - {""})


def _git(root: Path, *args: str) -> str:
    return subprocess.run(["git", "-C", str(root), *args], check=True, capture_output=True, text=True).stdout


def tracked_files(root: Path) -> list[str]:
    """`git ls-files` minus every path under eval/. Nothing in eval/ is ever opened."""
    listed = _git(root, "ls-files", "-z", "--", ".", f":(exclude){EVAL_DIR}/").split("\0")
    return [p for p in listed if p and not (p == EVAL_DIR or p.startswith(EVAL_DIR + "/"))]


def read_text(path: Path) -> str | None:
    """A file's text, or None for a binary file."""
    data = path.read_bytes()
    if b"\0" in data:
        return None
    try:
        return data.decode("utf-8")
    except UnicodeDecodeError:
        return None


def _inside(path: Path, folder: Path) -> bool:
    return path == folder or folder in path.parents


def also_files(folder: Path, root: Path) -> list[Path]:
    """Files under an extra folder. Paths under the project's eval/ are dropped unless the folder is eval/ itself."""
    eval_dir = (root / EVAL_DIR).resolve()
    want_eval = _inside(folder, eval_dir)
    found = []
    for p in sorted(folder.rglob("*")):
        if any(part in SKIP_DIRS for part in p.relative_to(folder).parts) or not p.is_file():
            continue
        if not want_eval and _inside(p.resolve(), eval_dir):
            continue
        found.append(p)
    return found


def _lines(numbers: Iterable[int]) -> str:
    ns = sorted(numbers)
    return ("line " if len(ns) == 1 else "lines ") + ", ".join(map(str, ns))


@dataclass
class Scope:
    label: str
    files: int = 0
    binary: int = 0
    found: dict[str, dict[str, set[int]]] = field(default_factory=dict)  # where -> kind -> line numbers

    def record(self, where: str, hits: dict[str, set[int]]) -> None:
        if any(hits.values()):
            self.found[where] = hits

    def count(self, kind: str, luc: bool | None = None) -> int:
        return sum(len(h[kind]) for w, h in self.found.items() if luc is None or is_luc_checked(w) == luc)

    def details(self, kinds: tuple[str, ...], luc: bool | None = None) -> list[str]:
        out = []
        for where in sorted(self.found):
            if luc is not None and is_luc_checked(where) != luc:
                continue
            parts = [f"{k} {_lines(self.found[where][k])}" for k in kinds if self.found[where][k]]
            if parts:
                out.append(f"  {where}: " + "; ".join(parts))
        return out


def is_luc_checked(path: str) -> bool:
    return path.startswith(LUC_CHECKED[0]) or path in LUC_CHECKED[1:]


def main(argv: list[str] | None = None, root: Path = ROOT) -> int:
    ap = argparse.ArgumentParser(description="Count-only privacy scan (never prints a name).")
    ap.add_argument("--also", action="append", default=[], metavar="DIR", help="extra folder to scan")
    ap.add_argument("--log", metavar="RANGE", help="also scan the commit messages in this git range")
    args = ap.parse_args(argv)

    loaded = load_names(root)
    if loaded is None:
        print(SKIP_LINE)
        return 0
    names, n_rows = loaded
    pat = Patterns()
    for name in names:
        pat.add(name)
    print("privacy scan: counts, paths and line numbers only")
    print(f"name strings: {len(names)} from {n_rows} self-represented rows")

    folders = [Path(d).expanduser().resolve() for d in args.also]
    eval_dir = (root / EVAL_DIR).resolve()
    if not any(_inside(f, eval_dir) for f in folders):
        print(EVAL_LINE)

    tracked = Scope("tracked files (git ls-files minus eval/)")
    for rel in tracked_files(root):
        path = root / rel
        if not path.is_file():
            continue
        text = read_text(path)
        if text is None:
            tracked.binary += 1
            continue
        tracked.files += 1
        tracked.record(rel, scan_lines(text.splitlines(), pat))

    scopes = [tracked]
    for folder in folders:
        extra = Scope(f"--also {folder}")
        for path in also_files(folder, root):
            text = read_text(path)
            if text is None:
                extra.binary += 1
                continue
            extra.files += 1
            extra.record(str(path), scan_lines(text.splitlines(), pat))
        scopes.append(extra)

    if args.log:
        log = Scope(f"commit messages {args.log}")
        out = _git(root, "log", "--format=%h%x1f%B%x1e", args.log)
        for entry in out.split("\x1e"):
            if "\x1f" not in entry:
                continue
            short, message = entry.strip("\n").split("\x1f", 1)
            log.files += 1
            log.record(f"commit {short}", scan_lines(message.splitlines(), pat))
        scopes.append(log)

    failures = 0
    for scope in scopes:
        luc = False if scope is tracked else None  # Luc's checked-value files get their own line below
        title, pair = scope.count("title", luc), scope.count("pair", luc)
        failures += title + pair
        kind = ("message" if scope.label.startswith("commit") else "text file") + ("" if scope.files == 1 else "s")
        skipped = f", {scope.binary} binary skipped" if scope.binary else ""
        outside = " (outside the LUC-CHECKED files)" if scope is tracked else ""
        print(f"{scope.label}: {scope.files} {kind}{skipped}; title hits {title}, pair hits {pair}{outside}")
        for line in scope.details(("title", "pair"), luc):
            print(line)
    luc_files = " | ".join(line.strip() for line in tracked.details(("title", "pair"), True))
    print(f"{LUC_LABEL}: title hits {tracked.count('title', True)}, pair hits {tracked.count('pair', True)}"
          + (f"; {luc_files}" if luc_files else ""))
    possible = [line for scope in scopes for line in scope.details(("possible",))]
    print(f"possible (for a person to look at; never a failure): {sum(s.count('possible') for s in scopes)}")
    for line in possible:
        print(line)
    verdict = "FAIL" if failures else "PASS"
    print(f"result: {verdict} ({failures} title or pair hit lines outside the LUC-CHECKED files)")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
