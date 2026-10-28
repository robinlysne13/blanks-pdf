"""Where Blanks keeps the few things it remembers: profile, marks, settings.

Everything lives in ~/.blanks (override with BLANKS_HOME), outside the repo,
so personal details can never be committed by accident.
"""

from __future__ import annotations

import json
import os
import re
from pathlib import Path
from typing import Any

MARKS = ("signature", "initials")

DEFAULT_SETTINGS: dict[str, Any] = {
    "date_format": "long",  # long | iso | dmy | mdy
    "send_images": True,  # let auto-fill read page images of scanned forms
}

EXAMPLE_PROFILE = Path(__file__).with_name("profile.example.md")


def home() -> Path:
    path = Path(os.environ.get("BLANKS_HOME") or Path.home() / ".blanks").expanduser()
    path.mkdir(parents=True, exist_ok=True)
    return path


def profile_path() -> Path:
    return home() / "profile.md"


def ensure_profile() -> Path:
    """Create the profile from the example the first time someone opens it."""
    path = profile_path()
    if not path.exists():
        path.write_text(EXAMPLE_PROFILE.read_text())
    return path


def read_profile() -> str | None:
    path = profile_path()
    if not path.exists():
        return None
    text = path.read_text().strip()
    return text or None


_ENTRY = re.compile(r"^\s*[-*]?\s*([^:#\n]{1,60}):\s*(.+?)\s*$")


def profile_entries(text: str | None) -> list[dict[str, str]]:
    """`key: value` lines with a real value, skipping comments and blanks."""
    if not text:
        return []
    text = re.sub(r"<!--.*?-->", "", text, flags=re.S)  # notes for the reader, not details
    out = []
    for line in text.splitlines():
        if line.lstrip().startswith(("#", "<!--", ">")):
            continue
        m = _ENTRY.match(line)
        if m and not m.group(2).startswith("["):
            out.append({"key": m.group(1).strip(), "value": m.group(2)})
    return out


def mark_path(kind: str) -> Path:
    if kind not in MARKS:
        raise ValueError(kind)
    return home() / f"{kind}.png"


def read_settings() -> dict[str, Any]:
    path = home() / "settings.json"
    settings = dict(DEFAULT_SETTINGS)
    if path.exists():
        try:
            stored = json.loads(path.read_text())
            settings.update({k: v for k, v in stored.items() if k in DEFAULT_SETTINGS})
        except (json.JSONDecodeError, AttributeError):
            pass
    return settings


def write_settings(patch: dict[str, Any]) -> dict[str, Any]:
    settings = read_settings()
    settings.update({k: v for k, v in patch.items() if k in DEFAULT_SETTINGS})
    (home() / "settings.json").write_text(json.dumps(settings, indent=2))
    return settings
