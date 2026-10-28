from __future__ import annotations

import pymupdf
import pytest


@pytest.fixture(autouse=True)
def blanks_home(tmp_path, monkeypatch):
    """Every test gets its own empty ~/.blanks."""
    home = tmp_path / "blanks-home"
    monkeypatch.setenv("BLANKS_HOME", str(home))
    return home


def _widget(page, kind, name, rect, **extra):
    w = pymupdf.Widget()
    w.field_type = kind
    w.field_name = name
    w.rect = pymupdf.Rect(*rect)
    for k, v in extra.items():
        setattr(w, k, v)
    page.add_widget(w)


@pytest.fixture
def fillable_pdf() -> bytes:
    doc = pymupdf.open()
    page = doc.new_page(width=612, height=792)
    page.insert_text((50, 112), "Full name", fontsize=10)
    _widget(page, pymupdf.PDF_WIDGET_TYPE_TEXT, "full_name", (150, 100, 400, 118))
    page.insert_text((50, 142), "Email", fontsize=10)
    _widget(page, pymupdf.PDF_WIDGET_TYPE_TEXT, "email", (150, 130, 400, 148), field_label="Email address")
    page.insert_text((50, 172), "I agree", fontsize=10)
    _widget(page, pymupdf.PDF_WIDGET_TYPE_CHECKBOX, "agree", (150, 160, 164, 174))
    _widget(page, pymupdf.PDF_WIDGET_TYPE_COMBOBOX, "term", (150, 190, 300, 208), choice_values=["6 months", "12 months"])
    return doc.tobytes()


@pytest.fixture
def flat_pdf() -> bytes:
    doc = pymupdf.open()
    page = doc.new_page(width=612, height=792)
    page.insert_text((50, 120), "Name:", fontsize=12)
    page.draw_line((95, 122), (400, 122))
    page.insert_text((50, 160), "Phone:", fontsize=12)
    page.draw_line((100, 162), (400, 162))
    return doc.tobytes()


@pytest.fixture
def png_bytes() -> bytes:
    pix = pymupdf.Pixmap(pymupdf.csRGB, pymupdf.IRect(0, 0, 40, 20), True)
    pix.set_rect(pix.irect, (17, 24, 39, 255))
    return pix.tobytes("png")
