"""PDF reading, rendering and flattening, built on PyMuPDF.

Coordinates: everything the frontend sees is in PDF points, origin at the top
left of the page *as displayed* (after any /Rotate). PyMuPDF reports widget
rects and text in unrotated page space, so we convert with the page's
rotation matrix on the way out and its derotation matrix on the way in.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any, Literal

import pymupdf

INK = (17 / 255, 24 / 255, 39 / 255)  # #111827, matches the UI's text ink
FONT = "helv"
# Where the text baseline sits inside a line box, as a fraction of font size.
# The frontend draws overlay text in Arial with line-height 1.2; this puts the
# PDF baseline in the same place.
BASELINE = 0.946
LINE_HEIGHT = 1.2

WIDGET_TYPES: dict[int, str] = {
    pymupdf.PDF_WIDGET_TYPE_TEXT: "text",
    pymupdf.PDF_WIDGET_TYPE_CHECKBOX: "checkbox",
    pymupdf.PDF_WIDGET_TYPE_RADIOBUTTON: "radio",
    pymupdf.PDF_WIDGET_TYPE_COMBOBOX: "choice",
    pymupdf.PDF_WIDGET_TYPE_LISTBOX: "choice",
    pymupdf.PDF_WIDGET_TYPE_SIGNATURE: "signature",
}


@dataclass
class Field:
    id: str
    name: str
    type: str
    page: int
    rect: list[float]
    label: str
    context: str
    value: str | bool
    options: list[str] = field(default_factory=list)
    on_state: str | None = None
    multiline: bool = False


@dataclass
class PageInfo:
    width: float
    height: float
    has_text: bool


def _open(data: bytes) -> pymupdf.Document:
    doc = pymupdf.open(stream=data, filetype="pdf")
    if doc.needs_pass:
        raise ValueError("This PDF is password protected.")
    return doc


def _nearby_text(page: pymupdf.Page, r: pymupdf.Rect) -> str:
    """Printed text a person would read as this field's label."""
    left = page.get_textbox(pymupdf.Rect(r.x0 - 260, r.y0 - 2, r.x0 - 1, r.y1 + 2)).strip()
    above = page.get_textbox(pymupdf.Rect(r.x0 - 4, r.y0 - 16, r.x1 + 4, r.y0 - 0.5)).strip()
    parts = [p.replace("\n", " ") for p in (above, left) if p]
    return " | ".join(parts)[:200]


def inspect(data: bytes) -> dict[str, Any]:
    """Page sizes plus every interactive form field, in display coordinates."""
    doc = _open(data)
    pages: list[PageInfo] = []
    fields: list[Field] = []
    for page in doc:
        rect = page.rect
        has_text = bool(page.get_text("text").strip())
        pages.append(PageInfo(width=rect.width, height=rect.height, has_text=has_text))
        rot = page.rotation_matrix
        for w in page.widgets():
            kind = WIDGET_TYPES.get(w.field_type)
            if kind is None:
                continue
            shown = w.rect * rot
            value: str | bool = w.field_value or ""
            on_state = None
            if kind in ("checkbox", "radio"):
                on_state = str(w.on_state()) if w.on_state() else "Yes"
                value = bool(w.field_value) and str(w.field_value) not in ("Off", "False", "false")
            fields.append(
                Field(
                    id=f"{page.number}:{w.xref}",
                    name=w.field_name or f"field_{w.xref}",
                    type=kind,
                    page=page.number,
                    rect=[round(v, 2) for v in (shown.x0, shown.y0, shown.x1, shown.y1)],
                    label=(w.field_label or "").strip(),
                    context=_nearby_text(page, w.rect),
                    value=value,
                    options=[str(o[0] if isinstance(o, (list, tuple)) else o) for o in (w.choice_values or [])],
                    on_state=on_state,
                    multiline=bool(w.field_flags & pymupdf.PDF_TX_FIELD_IS_MULTILINE) if kind == "text" else False,
                )
            )
    return {
        "pages": [asdict(p) for p in pages],
        "fields": [asdict(f) for f in fields],
        "is_fillable": any(f.type != "signature" for f in fields),
    }


def render_page(data: bytes, index: int, scale: float = 2.0) -> bytes:
    doc = _open(data)
    if not 0 <= index < doc.page_count:
        raise IndexError(index)
    page = doc[index]
    # Widgets are drawn by the app as live inputs, so leave them out here.
    pix = page.get_pixmap(matrix=pymupdf.Matrix(scale, scale), annots=False, alpha=False)
    return pix.tobytes("png")


def page_words(data: bytes, index: int) -> list[tuple[float, float, float, float, str]]:
    """Words on a page in display coordinates, for auto-fill on flat PDFs."""
    doc = _open(data)
    page = doc[index]
    rot = page.rotation_matrix
    out = []
    for x0, y0, x1, y1, word, *_ in page.get_text("words"):
        r = pymupdf.Rect(x0, y0, x1, y1) * rot
        out.append((round(r.x0, 1), round(r.y0, 1), round(r.x1, 1), round(r.y1, 1), word))
    return out


# ---------------------------------------------------------------- exporting

OverlayKind = Literal["text", "image", "check", "cross"]


def _hex(color: str | None) -> tuple[float, float, float]:
    if not color or not color.startswith("#") or len(color) != 7:
        return INK
    return tuple(int(color[i : i + 2], 16) / 255 for i in (1, 3, 5))  # type: ignore[return-value]


def _fill_widgets(doc: pymupdf.Document, values: dict[str, Any]) -> None:
    for page in doc:
        for w in page.widgets():
            kind = WIDGET_TYPES.get(w.field_type)
            if kind is None or w.field_name not in values:
                continue
            v = values[w.field_name]
            if kind == "text":
                w.field_value = "" if v is None else str(v)
            elif kind == "choice":
                w.field_value = str(v)
            elif kind == "checkbox":
                w.field_value = w.on_state() if v in (True, "true", "Yes", "yes", "on") else "Off"
            elif kind == "radio":
                w.field_value = str(v) == str(w.on_state())
            else:
                continue
            w.update()


def _draw_overlay(page: pymupdf.Page, o: dict[str, Any], images: dict[str, bytes]) -> None:
    derot = page.derotation_matrix
    x, y = float(o["x"]), float(o["y"])
    w, h = float(o.get("w", 0)), float(o.get("h", 0))
    color = _hex(o.get("color"))
    kind: OverlayKind = o["kind"]

    if kind == "text":
        size = float(o.get("fontSize", 12))
        for i, line in enumerate(str(o.get("text", "")).split("\n")):
            if not line:
                continue
            baseline = pymupdf.Point(x, y + size * (BASELINE + i * LINE_HEIGHT)) * derot
            page.insert_text(baseline, line, fontsize=size, fontname=FONT, color=color, rotate=page.rotation)
    elif kind == "image":
        png = images.get(o.get("image", ""))
        if png:
            rect = pymupdf.Rect(x, y, x + w, y + h) * derot
            page.insert_image(rect, stream=png, keep_proportion=True, rotate=page.rotation)
    elif kind in ("check", "cross"):
        s = max(w, h)
        width = max(1.2, s / 7)

        def pt(fx: float, fy: float) -> pymupdf.Point:
            return pymupdf.Point(x + fx * s, y + fy * s) * derot

        if kind == "check":
            page.draw_polyline([pt(0.12, 0.55), pt(0.4, 0.82), pt(0.9, 0.18)], color=color, width=width, lineCap=1, lineJoin=1)
        else:
            page.draw_line(pt(0.15, 0.15), pt(0.85, 0.85), color=color, width=width, lineCap=1)
            page.draw_line(pt(0.85, 0.15), pt(0.15, 0.85), color=color, width=width, lineCap=1)


def export(data: bytes, values: dict[str, Any], overlays: list[dict[str, Any]], images: dict[str, bytes]) -> bytes:
    """Fill fields, draw every overlay, then flatten everything into the page."""
    doc = _open(data)
    _fill_widgets(doc, values)
    for o in overlays:
        idx = int(o.get("page", 0))
        if 0 <= idx < doc.page_count:
            _draw_overlay(doc[idx], o, images)
    doc.bake(annots=True, widgets=True)
    return doc.tobytes(garbage=3, deflate=True)
