"""scripts/30_privacy_scan.py on a throwaway git repository with invented names only."""

import csv
import importlib.util
import subprocess

from aic import ROOT

_spec = importlib.util.spec_from_file_location("privacy_scan", ROOT / "scripts/30_privacy_scan.py")
scan = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(scan)

# Invented parties. Self-represented: the first four. Represented by a lawyer: the last.
SRL_TITLE = "Quorra Ashdown-Vell v Pelham Ferries Pty Ltd"
SRL_STATE = "Ottoline Brack v State of Queensland"
SRL_MINISTER = "Ignatius Fenwode v Minister for Immigration and Border Protection"
SRL_CHARLOTIN_ONLY = "Re Thaddeus Wrenfield"
LAWYER_TITLE = "Cassius Harrowgate v Ellery Holdings Pty Ltd"
NAME_WORDS = ("quorra", "ashdown", "vell", "pelham", "ottoline", "brack", "ignatius", "fenwode", "thaddeus",
              "wrenfield", "cassius", "harrowgate", "ellery")
FULL_COLUMNS = ["id", "title_as_published", "party_type", "charlotin_party_type", "charlotin_row"]


def write_csv(path, header, rows):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(header)
        w.writerows(rows)


def make_repo(tmp_path, files, names=True):
    """A git repo whose tracked files are `files`; the name files are written but, as in the project, untracked."""
    root = tmp_path / "repo"
    for rel, text in files.items():
        (root / rel).parent.mkdir(parents=True, exist_ok=True)
        (root / rel).write_text(text, encoding="utf-8")
    if names:
        write_csv(root / scan.FULL, FULL_COLUMNS, [
            ["AIC-0001", SRL_TITLE, "self_represented", "Pro Se Litigant", "11"],
            ["AIC-0002", SRL_STATE, "", "Pro Se Litigant", "12"],
            ["AIC-0003", SRL_MINISTER, "self_represented", "Lawyer", "13"],
            ["AIC-0004", "", "", "Pro Se Litigant", "14"],
            ["AIC-0005", LAWYER_TITLE, "lawyer", "Lawyer", "15"],
        ])
        write_csv(root / scan.CASES, ["charlotin_row", "Case Name", "Party(ies)"], [
            ["11", SRL_TITLE + " [2025] FCA 1", "Pro Se Litigant"],
            ["12", SRL_STATE, "Pro Se Litigant"],
            ["13", SRL_MINISTER, "Lawyer"],
            ["14", SRL_CHARLOTIN_ONLY, "Pro Se Litigant"],
            ["15", LAWYER_TITLE, "Lawyer"],
        ])
    root.mkdir(parents=True, exist_ok=True)
    subprocess.run(["git", "init", "-q", str(root)], check=True)
    if files:
        subprocess.run(["git", "-C", str(root), "add", "--", *files], check=True)
    return root


def run(root, capsys, *argv):
    code = scan.main(list(argv), root=root)
    out = capsys.readouterr().out
    lowered = out.lower()
    assert not [w for w in NAME_WORDS if w in lowered], "the scan printed a name"
    assert " v " not in out
    return code, out


def test_full_title_found_across_case_punctuation_and_line_break(tmp_path, capsys):
    root = make_repo(tmp_path, {"notes.md": "Intro.\nSee QUORRA ASHDOWN VELL v. Pelham\nFerries Pty Ltd, at [3].\n"})
    code, out = run(root, capsys)
    assert code == 1
    assert "  notes.md: title line 2" in out
    assert "title hits 1, pair hits 0 (outside the LUC-CHECKED files)" in out


def test_party_pairs_including_a_state_and_a_minister(tmp_path, capsys):
    text = "One: Brack v Queensland.\nTwo: Mr Fenwode v Minister for Home Affairs.\nThree: Ashdown-Vell v Pelham.\n"
    root = make_repo(tmp_path, {"docs/a.md": text})
    code, out = run(root, capsys)
    assert code == 1
    assert "  docs/a.md: pair lines 1, 2, 3" in out


def test_charlotin_case_name_of_a_row_without_a_title(tmp_path, capsys):
    root = make_repo(tmp_path, {"b.txt": "x\nre thaddeus wrenfield\n"})
    code, out = run(root, capsys)
    assert code == 1
    assert "  b.txt: title line 2" in out


def test_represented_party_title_is_not_a_hit(tmp_path, capsys):
    root = make_repo(tmp_path, {"c.md": LAWYER_TITLE + " [2024] FCA 9\nHarrowgate v Ellery\n"})
    code, out = run(root, capsys)
    assert code == 0
    assert "result: PASS" in out


def test_eval_folder_is_dropped_before_opening_and_said(tmp_path, capsys):
    root = make_repo(tmp_path, {"eval/items.csv": "citation\n" + SRL_TITLE + "\n", "ok.md": "nothing here\n"})
    assert scan.tracked_files(root) == ["ok.md"]
    code, out = run(root, capsys)
    assert code == 0
    assert scan.EVAL_LINE in out.splitlines()
    assert "items.csv" not in out
    assert "tracked files (git ls-files minus eval/): 1 text file;" in out


def test_luc_checked_files_reported_on_their_own_line(tmp_path, capsys):
    root = make_repo(tmp_path, {"aic/flags.py": f'TITLE = "{SRL_STATE}"\n',
                                "data/review/x.json": '{\n"t": "Brack v Queensland"\n}\n'})
    code, out = run(root, capsys)
    assert code == 0
    assert ("LUC-CHECKED (agents may not edit): title hits 1, pair hits 1; aic/flags.py: title line 1"
            " | data/review/x.json: pair line 2") in out.splitlines()
    assert "title hits 0, pair hits 0 (outside the LUC-CHECKED files)" in out


def test_possible_name_is_listed_but_never_fails(tmp_path, capsys):
    root = make_repo(tmp_path, {"d.md": "A note about Ottoline Brack.\n"})
    code, out = run(root, capsys)
    assert code == 0
    assert "possible (for a person to look at; never a failure): 1" in out
    assert "  d.md: possible line 1" in out


def test_skipped_without_name_files(tmp_path, capsys):
    root = make_repo(tmp_path, {"e.md": SRL_TITLE + "\n"}, names=False)
    code, out = run(root, capsys)
    assert code == 0
    assert out.strip() == scan.SKIP_LINE


def test_commit_messages_and_extra_folder(tmp_path, capsys):
    root = make_repo(tmp_path, {"f.md": "clean\n"})
    subprocess.run(["git", "-C", str(root), "-c", "user.name=t", "-c", "user.email=t@example.invalid", "commit",
                    "-q", "-m", "Fix the Brack v State of Queensland row"], check=True)
    extra = tmp_path / "workspace"
    extra.mkdir()
    (extra / "log.md").write_text("ok\nok\nFenwode v Minister\n", encoding="utf-8")
    code, out = run(root, capsys, "--log", "HEAD", "--also", str(extra))
    assert code == 1
    assert "commit messages HEAD: 1 message; title hits 0, pair hits 1" in out
    assert f"  {(extra / 'log.md').resolve()}: pair line 3" in out


def test_tokens_fold_case_accents_and_v_forms():
    assert scan.tokens("ÖRMSBY  v. Tållon") == scan.tokens("ormsby v tallon") == ["ormsby", "v", "tallon"]
    assert scan.tokens("Ormsby vs Tallon & Anor") == ["ormsby", "v", "tallon", "and", "anor"]
