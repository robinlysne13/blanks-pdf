"""Build the sample forms the app offers on its start screen.

    uv run --project backend python scripts/make_samples.py

Writes three PDFs to frontend/public/samples/:
  lease-renewal.pdf   a fillable form with real fields
  intake-form.pdf     a flat form: printed labels and lines, no fields
  intake-scan.pdf     the same intake form as a page image, like a scan
"""

from pathlib import Path

import pymupdf

OUT = Path(__file__).resolve().parents[1] / "frontend" / "public" / "samples"
INK = (0.13, 0.15, 0.18)
W, H = 612, 792


def heading(page, y, text):
    page.insert_text((54, y), text, fontsize=9, fontname="hebo", color=INK)
    page.draw_line((54, y + 5), (W - 54, y + 5), color=INK, width=0.8)


def field(page, name, label, x, y, w, h=20):
    page.insert_text((x, y - 4), label.upper(), fontsize=7, fontname="helv", color=(0.42, 0.45, 0.5))
    wd = pymupdf.Widget()
    wd.field_type = pymupdf.PDF_WIDGET_TYPE_TEXT
    wd.field_name = name
    wd.field_label = label
    wd.rect = pymupdf.Rect(x, y, x + w, y + h)
    wd.text_fontsize = 0
    wd.fill_color = (0.95, 0.96, 0.97)
    wd.border_color = (0.8, 0.82, 0.86)
    page.add_widget(wd)


def lease() -> bytes:
    doc = pymupdf.open()
    page = doc.new_page(width=W, height=H)
    page.insert_text((54, 72), "LEASE RENEWAL FORM", fontsize=16, fontname="hebo", color=INK)
    page.insert_text((54, 90), "Complete every field and return it to the property office.", fontsize=9, color=(0.42, 0.45, 0.5))

    heading(page, 124, "TENANT INFORMATION")
    field(page, "full_name", "Full name", 54, 150, 504)
    field(page, "date_of_birth", "Date of birth", 54, 196, 240)
    field(page, "phone", "Phone", 318, 196, 240)
    field(page, "current_address", "Current address", 54, 242, 504)
    field(page, "email", "Email", 54, 288, 504)

    heading(page, 334, "RENEWAL TERM")
    for i, (key, label) in enumerate([("term_12_months", "12 months"), ("term_6_months", "6 months"), ("term_month_to_month", "Month-to-month")]):
        x = 54 + i * 140
        cb = pymupdf.Widget()
        cb.field_type = pymupdf.PDF_WIDGET_TYPE_CHECKBOX
        cb.field_name = key
        cb.field_label = f"Renewal term: {label}"
        cb.rect = pymupdf.Rect(x, 350, x + 12, 362)
        cb.border_color = INK
        page.add_widget(cb)
        page.insert_text((x + 18, 360), label, fontsize=10, color=INK)

    heading(page, 398, "EMERGENCY CONTACT")
    field(page, "emergency_name", "Name", 54, 424, 240)
    field(page, "emergency_phone", "Phone", 318, 424, 240)

    page.insert_text((54, 484), "I confirm the information above is accurate.", fontsize=9, color=INK)
    for x, label in ((54, "SIGNATURE"), (330, "DATE")):
        page.draw_line((x, 540), (x + (240 if x == 54 else 228), 540), color=INK, width=0.8)
        page.insert_text((x, 552), label, fontsize=7, color=(0.42, 0.45, 0.5))
    return doc.tobytes(garbage=3, deflate=True)


def intake() -> bytes:
    doc = pymupdf.open()
    page = doc.new_page(width=W, height=H)
    page.insert_text((190, 80), "NEW PATIENT INTAKE", fontsize=15, fontname="cobo", color=INK)
    rows = [
        (130, [("Name:", 54, 558)]),
        (170, [("Date of birth:", 54, 300), ("Phone:", 320, 558)]),
        (210, [("Address:", 54, 558)]),
        (250, [("Email:", 54, 558)]),
        (290, [("Insurance provider:", 54, 558)]),
        (330, [("Policy #:", 54, 558)]),
        (400, [("Signature:", 54, 380), ("Date:", 396, 558)]),
    ]
    for y, items in rows:
        for label, x0, x1 in items:
            page.insert_text((x0, y), label, fontsize=11, fontname="cour", color=INK)
            lx = x0 + pymupdf.get_text_length(label, "cour", 11) + 6
            page.draw_line((lx, y + 2), (x1, y + 2), color=INK, width=0.7)
    page.insert_text((54, 470), "Please list any allergies:", fontsize=11, fontname="cour", color=INK)
    for y in (500, 530):
        page.draw_line((54, y), (558, y), color=INK, width=0.7)
    return doc.tobytes(garbage=3, deflate=True)


def as_scan(pdf: bytes) -> bytes:
    """Render to a slightly tilted grey image and wrap it in a PDF: no text layer."""
    src = pymupdf.open(stream=pdf)[0]
    pix = src.get_pixmap(matrix=pymupdf.Matrix(2, 2), colorspace=pymupdf.csGRAY)
    doc = pymupdf.open()
    page = doc.new_page(width=W, height=H)
    page.draw_rect(page.rect, color=None, fill=(0.98, 0.975, 0.96))
    page.insert_image(pymupdf.Rect(4, 2, W + 2, H - 2), pixmap=pix)
    return doc.tobytes(garbage=3, deflate=True)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    flat = intake()
    for name, data in (("lease-renewal.pdf", lease()), ("intake-form.pdf", flat), ("intake-scan.pdf", as_scan(flat))):
        (OUT / name).write_bytes(data)
        print("wrote", OUT / name)


if __name__ == "__main__":
    main()
