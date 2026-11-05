from aic.pdfmeta import strip_dates

PDF = (b"%PDF-1.4\n1 0 obj\n<</Creator (Test) /Producer (Skia/PDF m156)\n/CreationDate (D:20261027042858+00'00')\n"
       b"/ModDate (D:20261027042858+00'00')>>\nendobj\ntrailer\n<</Info 1 0 R>>\n%%EOF\n")


def test_dates_blanked_without_moving_bytes(tmp_path):
    p = tmp_path / "a.pdf"
    p.write_bytes(PDF)
    assert strip_dates(p) == 2
    out = p.read_bytes()
    assert len(out) == len(PDF)
    assert b"Date" not in out and b"D:2026" not in out
    assert b"/Producer (Skia/PDF m156)" in out and out.endswith(b"%%EOF\n")


def test_no_dates_leaves_file_alone(tmp_path):
    p = tmp_path / "b.pdf"
    p.write_bytes(b"%PDF-1.4\n%%EOF\n")
    assert strip_dates(p) == 0
    assert p.read_bytes() == b"%PDF-1.4\n%%EOF\n"
