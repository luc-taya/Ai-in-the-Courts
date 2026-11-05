"""Remove the creation and modification dates that headless Chrome writes into a PDF's Info dictionary.

Public PDFs should not carry a work date (LUC-TODO P1-8). Each "/CreationDate (D:...)" and "/ModDate (D:...)"
entry is overwritten with spaces of the same length, which a PDF reader treats as whitespace inside the
dictionary. No byte moves, so the cross-reference table stays valid and no PDF library is needed.
"""

import re
from pathlib import Path

_DATE = re.compile(rb"/(?:CreationDate|ModDate)\s*\(D:[^)]*\)")


def strip_dates(path: Path) -> int:
    """Blank every date entry in the PDF at `path`; return how many were blanked."""
    data = path.read_bytes()
    out, n = _DATE.subn(lambda m: b" " * len(m.group(0)), data)
    if n:
        path.write_bytes(out)
    return n
