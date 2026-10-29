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


def test_profile_entries_skip_placeholders():
    config.profile_path().write_text("# me\nfull name: Sam Example\nphone: [Phone number]\n<!-- note: x -->\n")
    assert config.profile_entries(config.read_profile()) == [{"key": "full name", "value": "Sam Example"}]


def test_profile_rows_include_placeholders_as_hints(client):
    config.profile_path().write_text("full name: Sam Example\nphone: [Phone number]\n")
    assert client.get("/api/profile", headers=H).json()["rows"] == [
        {"key": "full name", "value": "Sam Example", "hint": ""},
        {"key": "phone", "value": "", "hint": "Phone number"},
    ]


def test_profile_save_edits_in_place(client):
    config.profile_path().write_text(
        "# My profile\n<!--\nnote: not a detail\n-->\n\nfull name: Sam\nphone: [Phone number]\ncity: Paris\n"
    )
    r = client.put("/api/profile", headers=H, json={"rows": [
        {"key": "full name", "value": "Sam Example"},          # changed
        {"key": "phone", "value": ""},                         # still empty: keeps its hint
        {"key": "OHIP number", "value": "1234"},               # new: added at the end
    ]})                                                        # city: removed
    assert r.status_code == 200
    text = config.profile_path().read_text()
    assert text == "# My profile\n<!--\nnote: not a detail\n-->\n\nfull name: Sam Example\nphone: [Phone number]\nOHIP number: 1234\n"
    assert config.profile_path().stat().st_mode & 0o777 == 0o600


def test_profile_rename_keeps_position(client):
    config.profile_path().write_text("a: 1\nb: 2\n")
    client.put("/api/profile", headers=H, json={"rows": [{"key": "alpha", "was": "a", "value": "1"}, {"key": "b", "value": "2"}]})
    assert config.profile_path().read_text() == "alpha: 1\nb: 2\n"


def test_profile_save_cleans_keys(client):
    client.put("/api/profile", headers=H, json={"rows": [{"key": "bad:key\n", "value": "line\nbreak"}]})
    assert config.profile_entries(config.read_profile())[-1] == {"key": "bad key", "value": "line break"}


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
    assert config.profile_entries(config.read_profile()) == []
    rows = client.get("/api/profile", headers=H).json()["rows"]
    assert rows and all(r["value"] == "" and r["hint"] for r in rows)


def test_chat_endpoint(client, fillable_pdf, monkeypatch):
    monkeypatch.setattr(autofill, "runner", lambda *a: {"reply": "Done.", "fills": [{"name": "email", "value": "a@b.c"}], "placements": [], "edits": []})
    doc = _open(client, fillable_pdf)
    r = client.post(f"/api/documents/{doc['id']}/chat", headers=H, json={"messages": [{"role": "user", "text": "my email is a@b.c"}]})
    assert r.status_code == 200
    assert r.json()["values"] == {"email": "a@b.c"}


def test_same_pdf_gets_the_same_id(client, fillable_pdf):
    """A window whose document was forgotten can send it again and keep its id."""
    from blanks import store

    first = _open(client, fillable_pdf)["id"]
    store._docs.clear()  # what a server restart does
    assert client.get(f"/api/documents/{first}/pages/0.png?scale=1", headers=H).status_code == 404
    assert _open(client, fillable_pdf)["id"] == first
    assert client.get(f"/api/documents/{first}/pages/0.png?scale=1", headers=H).status_code == 200
