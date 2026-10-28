import pytest

from blanks import autofill, pdf

PROFILE = "full name: Sam Example\nemail: sam@example.com"


@pytest.fixture
def fake_claude(monkeypatch):
    calls = []

    def install(answer):
        def runner(prompt, schema, cwd, allow_read):
            calls.append({"prompt": prompt, "schema": schema, "allow_read": allow_read, "files": sorted(p.name for p in cwd.iterdir())})
            return answer

        monkeypatch.setattr(autofill, "runner", runner)
        return calls

    return install


def test_fields_mode_keeps_only_valid_values(fillable_pdf, fake_claude):
    calls = fake_claude({"fills": [
        {"name": "full_name", "value": "Sam Example"},
        {"name": "agree", "value": "true"},
        {"name": "term", "value": "18 months"},  # not an option: dropped
        {"name": "not_a_field", "value": "x"},  # unknown: dropped
    ]})
    info = pdf.inspect(fillable_pdf)
    result = autofill.autofill(fillable_pdf, info, PROFILE, send_images=True)

    assert result["mode"] == "fields"
    assert result["values"] == {"full_name": "Sam Example", "agree": True}
    assert result["missing"] == ["email"]  # the unanswered choice is not "missing"
    assert calls[0]["allow_read"] is False
    assert "Sam Example" in calls[0]["prompt"]
    assert '"options"' in calls[0]["prompt"]


def test_scan_mode_converts_pixels_to_points(flat_pdf, fake_claude):
    calls = fake_claude({"placements": [
        {"page": 0, "x": 150, "y": 183, "text": "Sam Example", "label": "Name:"},
        {"page": 3, "x": 1, "y": 1, "text": "bad page", "label": "?"},
    ]})
    info = pdf.inspect(flat_pdf)
    result = autofill.autofill(flat_pdf, info, PROFILE, send_images=True)

    assert result["mode"] == "scan"
    [p] = result["placements"]
    assert p["x"] == pytest.approx(100.0 + autofill.SCAN_GAP)
    assert p["y"] == pytest.approx(122 - 11 * 1.15, abs=0.1)
    assert p["text"] == "Sam Example"
    assert calls[0]["allow_read"] is True
    assert calls[0]["files"] == ["page-0.png"]
    assert "Name:" in calls[0]["prompt"]  # printed words are passed along


def test_scan_without_images_uses_words_only(flat_pdf, fake_claude):
    calls = fake_claude({"placements": []})
    autofill.autofill(flat_pdf, pdf.inspect(flat_pdf), PROFILE, send_images=False)
    assert calls[0]["allow_read"] is False
    assert calls[0]["files"] == []


def test_empty_profile_is_an_error(fillable_pdf):
    with pytest.raises(autofill.AutofillError, match="profile"):
        autofill.autofill(fillable_pdf, pdf.inspect(fillable_pdf), None, True)


def test_missing_cli_is_an_error(monkeypatch, tmp_path):
    monkeypatch.setenv("BLANKS_CLAUDE_BIN", "")
    monkeypatch.setattr(autofill.shutil, "which", lambda _: None)
    monkeypatch.setattr(autofill, "CLAUDE_LOCATIONS", ())
    with pytest.raises(autofill.AutofillError, match="isn't installed"):
        autofill.run_claude("hi", {}, tmp_path, False)


def test_finds_claude_outside_path(monkeypatch, tmp_path):
    exe = tmp_path / "claude"
    exe.write_text("#!/bin/sh\n")
    exe.chmod(0o755)
    monkeypatch.setenv("BLANKS_CLAUDE_BIN", "")
    monkeypatch.setattr(autofill.shutil, "which", lambda _: None)
    monkeypatch.setattr(autofill, "CLAUDE_LOCATIONS", (str(exe),))
    assert autofill.claude_bin() == str(exe)
