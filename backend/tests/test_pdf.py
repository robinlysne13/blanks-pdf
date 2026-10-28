import pymupdf

from blanks import pdf


def test_inspect_finds_fields_with_labels(fillable_pdf):
    info = pdf.inspect(fillable_pdf)
    assert info["is_fillable"]
    assert info["pages"] == [{"width": 612.0, "height": 792.0, "has_text": True}]
    by_name = {f["name"]: f for f in info["fields"]}
    assert set(by_name) == {"full_name", "email", "agree", "term"}
    assert by_name["full_name"]["type"] == "text"
    assert "Full name" in by_name["full_name"]["context"]
    assert by_name["email"]["label"] == "Email address"
    assert by_name["agree"]["type"] == "checkbox"
    assert by_name["agree"]["value"] is False
    assert by_name["term"]["options"] == ["6 months", "12 months"]


def test_flat_pdf_is_not_fillable(flat_pdf):
    info = pdf.inspect(flat_pdf)
    assert not info["is_fillable"]
    assert info["fields"] == []


def test_render_page_is_png(fillable_pdf):
    assert pdf.render_page(fillable_pdf, 0, 1.0).startswith(b"\x89PNG")


def test_export_fills_and_flattens(fillable_pdf):
    out = pdf.export(
        fillable_pdf,
        {"full_name": "Sam Example", "agree": True, "term": "12 months"},
        [{"kind": "text", "page": 0, "x": 50, "y": 300, "text": "Two\nlines", "fontSize": 12}],
        {},
    )
    page = pymupdf.open(stream=out)[0]
    assert list(page.widgets()) == []  # flattened: nothing left to edit
    text = page.get_text()
    assert "Sam Example" in text
    assert "12 months" in text
    assert "Two" in text and "lines" in text


def test_export_places_images_and_marks(flat_pdf, png_bytes):
    out = pdf.export(
        flat_pdf,
        {},
        [
            {"kind": "image", "page": 0, "x": 100, "y": 90, "w": 80, "h": 40, "image": "signature"},
            {"kind": "check", "page": 0, "x": 300, "y": 300, "w": 14, "h": 14},
            {"kind": "cross", "page": 0, "x": 330, "y": 300, "w": 14, "h": 14},
        ],
        {"signature": png_bytes},
    )
    page = pymupdf.open(stream=out)[0]
    assert len(page.get_images()) == 1
    assert len(page.get_drawings()) >= 3  # two form lines plus the marks


def test_overlay_on_missing_page_is_ignored(flat_pdf):
    out = pdf.export(flat_pdf, {}, [{"kind": "text", "page": 5, "x": 0, "y": 0, "text": "x"}], {})
    assert pymupdf.open(stream=out).page_count == 1
