import pytest
from fastapi.testclient import TestClient

from blanks import autofill, config
from blanks.app import app

H = {"X-Blanks": "1"}


@pytest.fixture
def client():
    return TestClient(app, base_url="http://127.0.0.1:8765")


def _open(client, data):
    r = client.post("/api/documents", headers=H, files={"file": ("lease.pdf", data, "application/pdf")})
    assert r.status_code == 200, r.text
    return r.json()


def test_api_needs_header(client):
    assert client.get("/api/status").status_code == 403
    assert client.get("/api/status", headers=H).status_code == 200


def test_other_hosts_are_refused():
    evil = TestClient(app, base_url="http://evil.example")
    assert evil.get("/api/status", headers=H).status_code == 403


def test_open_render_export(client, fillable_pdf):
    doc = _open(client, fillable_pdf)
    assert doc["name"] == "lease.pdf"
    assert len(doc["fields"]) == 4

    png = client.get(f"/api/documents/{doc['id']}/pages/0.png?scale=1", headers=H)
    assert png.headers["content-type"] == "image/png"

    out = client.post(f"/api/documents/{doc['id']}/export", headers=H, json={"values": {"full_name": "Sam"}, "overlays": []})
    assert out.headers["content-type"] == "application/pdf"
    assert out.content.startswith(b"%PDF")


def test_rejects_non_pdf(client):
    r = client.post("/api/documents", headers=H, files={"file": ("x.pdf", b"hello", "application/pdf")})
    assert r.status_code == 400


def test_unknown_document_is_404(client):
    assert client.get("/api/documents/nope/pages/0.png", headers=H).status_code == 404


def test_marks_roundtrip(client, png_bytes):
    assert client.get("/api/marks/signature", headers=H).status_code == 404
    assert client.put("/api/marks/signature", headers=H, content=png_bytes).status_code == 200
    assert client.get("/api/marks/signature", headers=H).content == png_bytes
    assert client.put("/api/marks/signature", headers=H, content=b"not a png").status_code == 400
    assert client.get("/api/status", headers=H).json()["marks"] == {"signature": True, "initials": False}


def test_settings_ignore_unknown_keys(client):
    r = client.put("/api/settings", headers=H, json={"date_format": "iso", "evil": 1})
    assert r.json() == {"date_format": "iso", "send_images": True}


def test_profile_entries_skip_placeholders(client):
    config.profile_path().write_text("# me\nfull name: Sam Example\nphone: [Phone number]\n<!-- note: x -->\n")
    assert client.get("/api/profile", headers=H).json()["entries"] == [{"key": "full name", "value": "Sam Example"}]


def test_autofill_endpoint_reports_errors(client, fillable_pdf):
    doc = _open(client, fillable_pdf)
    r = client.post(f"/api/documents/{doc['id']}/autofill", headers=H)
    assert r.status_code == 422
    assert "profile" in r.json()["detail"]


def test_autofill_endpoint(client, fillable_pdf, monkeypatch):
    config.profile_path().write_text("full name: Sam Example")
    monkeypatch.setattr(autofill, "runner", lambda *a: {"fills": [{"name": "full_name", "value": "Sam Example"}]})
    doc = _open(client, fillable_pdf)
    r = client.post(f"/api/documents/{doc['id']}/autofill", headers=H)
    assert r.json()["values"] == {"full_name": "Sam Example"}


def test_example_profile_has_no_entries_until_filled(client):
    config.ensure_profile()
    assert client.get("/api/profile", headers=H).json()["entries"] == []
