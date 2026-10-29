"""The local HTTP API, plus the built frontend when it exists."""

from __future__ import annotations

import os
import platform
import subprocess
import time
from pathlib import Path
from typing import Any

from fastapi import FastAPI, File, HTTPException, Request, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from . import autofill, config, pdf, store

MAX_PDF_BYTES = 60 * 1024 * 1024
MAX_MARK_BYTES = 2 * 1024 * 1024
ALLOWED_HOSTS = {"127.0.0.1", "localhost", "[::1]"}

app = FastAPI(title="Blanks", docs_url=None, redoc_url=None)

# When the app last talked to the server. The open window pings every
# minute, so `blanks --idle-exit` can stop the server once it's closed.
last_seen = time.monotonic()


@app.middleware("http")
async def local_only(request: Request, call_next):
    """Blanks runs on localhost. Two guards keep other websites out:
    the Host check stops DNS rebinding, and the custom header on API calls
    forces a CORS preflight that this server never approves."""
    host = (request.headers.get("host") or "").rsplit(":", 1)[0]
    if host not in ALLOWED_HOSTS:
        return JSONResponse({"detail": "Blanks only answers on localhost."}, status_code=403)
    if request.url.path.startswith("/api/"):
        if request.headers.get("x-blanks") != "1":
            return JSONResponse({"detail": "Missing X-Blanks header."}, status_code=403)
        global last_seen
        last_seen = time.monotonic()
    return await call_next(request)


def _doc(doc_id: str) -> store.Document:
    doc = store.get(doc_id)
    if doc is None:
        raise HTTPException(404, "That document is no longer open. Open it again.")
    return doc


# ------------------------------------------------------------------ status


@app.get("/api/ping")
def ping() -> dict[str, bool]:
    return {"ok": True}


@app.get("/api/status")
def status() -> dict[str, Any]:
    text = config.read_profile()
    return {
        "profile": {"path": str(config.profile_path()), "exists": text is not None, "count": len(config.profile_entries(text))},
        "claude": {"available": autofill.claude_bin() is not None},
        "marks": {k: any(m["kind"] == k for m in config.list_marks()) for k in config.MARK_KINDS},
        "settings": config.read_settings(),
    }


# --------------------------------------------------------------- documents


@app.post("/api/documents")
async def open_document(file: UploadFile = File(...)) -> dict[str, Any]:
    data = await file.read(MAX_PDF_BYTES + 1)
    if len(data) > MAX_PDF_BYTES:
        raise HTTPException(413, "That PDF is over 60 MB.")
    if not data.startswith(b"%PDF"):
        raise HTTPException(400, "That file isn't a PDF.")
    try:
        info = await run_in_threadpool(pdf.inspect, data)
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    except Exception as e:  # PyMuPDF raises its own types for broken files
        raise HTTPException(400, "Blanks couldn't read that PDF.") from e
    doc = store.add(Path(file.filename or "document.pdf").name, data)
    return {"id": doc.id, "name": doc.name, **info}


@app.delete("/api/documents/{doc_id}")
def close_document(doc_id: str) -> dict[str, bool]:
    """Done with a form: forget it. Blanks keeps no copy."""
    store.remove(doc_id)
    return {"ok": True}


@app.get("/api/documents/{doc_id}/pages/{index}.png")
async def page_image(doc_id: str, index: int, scale: float = 2.0) -> Response:
    doc = _doc(doc_id)
    scale = min(max(scale, 0.5), 4.0)
    try:
        png = await run_in_threadpool(pdf.render_page, doc.data, index, scale)
    except IndexError as e:
        raise HTTPException(404, "No such page.") from e
    return Response(png, media_type="image/png", headers={"Cache-Control": "private, max-age=3600"})


class ExportBody(BaseModel):
    values: dict[str, Any] = Field(default_factory=dict)
    overlays: list[dict[str, Any]] = Field(default_factory=list)


@app.post("/api/documents/{doc_id}/export")
async def export(doc_id: str, body: ExportBody) -> Response:
    doc = _doc(doc_id)
    images = {m["id"]: config.mark_file(m["id"]).read_bytes() for m in config.list_marks()}
    try:
        out = await run_in_threadpool(pdf.export, doc.data, body.values, body.overlays, images)
    except (KeyError, ValueError, TypeError) as e:
        raise HTTPException(400, f"Couldn't build the PDF: {e}") from e
    return Response(out, media_type="application/pdf")


@app.post("/api/documents/{doc_id}/autofill")
async def run_autofill(doc_id: str) -> dict[str, Any]:
    doc = _doc(doc_id)
    info = await run_in_threadpool(pdf.inspect, doc.data)
    settings = config.read_settings()
    try:
        return await run_in_threadpool(
            autofill.autofill, doc.data, info, config.read_profile(), bool(settings["send_images"])
        )
    except autofill.AutofillError as e:
        raise HTTPException(422, str(e)) from e


class ChatBody(BaseModel):
    messages: list[dict[str, str]] = Field(max_length=60)
    values: dict[str, Any] = Field(default_factory=dict)
    overlays: list[dict[str, Any]] = Field(default_factory=list)


@app.post("/api/documents/{doc_id}/chat")
async def run_chat(doc_id: str, body: ChatBody) -> dict[str, Any]:
    doc = _doc(doc_id)
    if any(len(m.get("text", "")) > 30_000 for m in body.messages):
        raise HTTPException(413, "That message is too long. Paste the part that matters.")
    info = await run_in_threadpool(pdf.inspect, doc.data)
    settings = config.read_settings()
    try:
        return await run_in_threadpool(
            autofill.chat,
            doc.data,
            info,
            config.read_profile(),
            body.messages,
            body.values,
            body.overlays,
            bool(settings["send_images"]),
        )
    except autofill.AutofillError as e:
        raise HTTPException(422, str(e)) from e


# ------------------------------------------------------------------- marks


@app.get("/api/marks")
def list_marks() -> dict[str, Any]:
    return {"marks": config.list_marks()}


def _mark_path(mark_id: str) -> Path:
    try:
        return config.mark_file(mark_id)
    except ValueError as e:
        raise HTTPException(404) from e


@app.get("/api/marks/{mark_id}")
def get_mark(mark_id: str) -> Response:
    path = _mark_path(mark_id)
    if not path.exists():
        raise HTTPException(404, "That signature isn't saved.")
    return FileResponse(path, media_type="image/png", headers={"Cache-Control": "no-store"})


@app.put("/api/marks/{mark_id}")
async def put_mark(mark_id: str, request: Request, name: str = "", kind: str = "signature") -> dict[str, str]:
    _mark_path(mark_id)
    data = await request.body()
    if len(data) > MAX_MARK_BYTES or not data.startswith(b"\x89PNG"):
        raise HTTPException(400, "Send a PNG under 2 MB.")
    try:
        return config.save_mark(mark_id, name, kind, data)
    except ValueError as e:
        raise HTTPException(400, str(e)) from e


class MarkPatch(BaseModel):
    name: str


@app.patch("/api/marks/{mark_id}")
def rename_mark(mark_id: str, body: MarkPatch) -> dict[str, str]:
    _mark_path(mark_id)
    try:
        return config.rename_mark(mark_id, body.name)
    except KeyError as e:
        raise HTTPException(404, "That signature isn't saved.") from e


@app.delete("/api/marks/{mark_id}")
def delete_mark(mark_id: str) -> dict[str, bool]:
    _mark_path(mark_id)
    config.delete_mark(mark_id)
    return {"ok": True}


# ------------------------------------------------------- profile, settings


def _profile_payload() -> dict[str, Any]:
    text = config.read_profile()
    # No profile yet: show the example's rows so there is something to fill in.
    rows = config.profile_rows(text if text is not None else config.EXAMPLE_PROFILE.read_text())
    return {"path": str(config.profile_path()), "exists": text is not None, "rows": rows}


@app.get("/api/profile")
def get_profile() -> dict[str, Any]:
    return _profile_payload()


class ProfileBody(BaseModel):
    rows: list[dict[str, Any]]


@app.put("/api/profile")
def put_profile(body: ProfileBody) -> dict[str, Any]:
    if len(body.rows) > 200:
        raise HTTPException(400, "That's a lot of details. Keep it under 200.")
    config.save_profile_rows(body.rows)
    return _profile_payload()


@app.post("/api/profile/open")
def open_profile() -> dict[str, str]:
    path = config.ensure_profile()
    system = platform.system()
    cmd = ["open", "-t", str(path)] if system == "Darwin" else ["xdg-open", str(path)]
    if system == "Windows":
        os.startfile(path)  # type: ignore[attr-defined]  # noqa: S606
    else:
        subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)  # noqa: S603
    return {"path": str(path)}


@app.get("/api/settings")
def get_settings() -> dict[str, Any]:
    return config.read_settings()


@app.put("/api/settings")
def put_settings(patch: dict[str, Any]) -> dict[str, Any]:
    return config.write_settings(patch)


# ---------------------------------------------------------------- frontend


def _static_dir() -> Path | None:
    candidates = [os.environ.get("BLANKS_STATIC"), Path(__file__).resolve().parents[3] / "frontend" / "dist"]
    for c in candidates:
        if c and (Path(c) / "index.html").exists():
            return Path(c)
    return None


if (static := _static_dir()) is not None:
    app.mount("/", StaticFiles(directory=static, html=True), name="frontend")
else:

    @app.get("/")
    def no_frontend() -> Response:
        return Response(
            "Blanks' API is running, but the frontend isn't built yet. Run ./start from the repo root.",
            media_type="text/plain",
        )
