"""`blanks`: start the local server and open it in its own window."""

from __future__ import annotations

import argparse
import os
import platform
import shutil
import subprocess
import threading
import time
import urllib.request
import webbrowser
from pathlib import Path

import uvicorn

# Browsers that can open a page as a standalone app window (--app=URL):
# no tabs, no address bar, just Blanks.
MAC_BROWSERS = ["Google Chrome", "Microsoft Edge", "Brave Browser", "Chromium"]
LINUX_BROWSERS = ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser", "microsoft-edge", "brave-browser"]
WINDOWS_BROWSERS = [
    r"Google\Chrome\Application\chrome.exe",
    r"Microsoft\Edge\Application\msedge.exe",
    r"BraveSoftware\Brave-Browser\Application\brave.exe",
]


def app_browser() -> str | None:
    system = platform.system()
    if system == "Darwin":
        for name in MAC_BROWSERS:
            for root in (Path("/Applications"), Path.home() / "Applications"):
                exe = root / f"{name}.app" / "Contents" / "MacOS" / name
                if exe.exists():
                    return str(exe)
    elif system == "Windows":
        for base in filter(None, (os.environ.get("PROGRAMFILES"), os.environ.get("PROGRAMFILES(X86)"), os.environ.get("LOCALAPPDATA"))):
            for rel in WINDOWS_BROWSERS:
                exe = Path(base) / rel
                if exe.exists():
                    return str(exe)
    else:
        for name in LINUX_BROWSERS:
            if exe := shutil.which(name):
                return exe
    return None


def open_window(url: str, tab: bool = False) -> None:
    exe = None if tab else app_browser()
    if exe:
        subprocess.Popen(
            [exe, f"--app={url}", "--window-size=1320,900"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            start_new_session=True,
        )
    else:
        webbrowser.open(url)


def is_running(url: str) -> bool:
    req = urllib.request.Request(f"{url}/api/ping", headers={"X-Blanks": "1"})
    try:
        with urllib.request.urlopen(req, timeout=1) as res:
            return res.status == 200
    except OSError:
        return False


def main() -> None:
    parser = argparse.ArgumentParser(prog="blanks", description="Fill in and sign PDF forms locally.")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--no-browser", action="store_true", help="don't open a window")
    parser.add_argument("--tab", action="store_true", help="open in a normal browser tab instead of an app window")
    parser.add_argument("--idle-exit", type=float, metavar="MINUTES", help="stop the server after this long with no window open")
    args = parser.parse_args()

    url = f"http://127.0.0.1:{args.port}"

    # Already running (say, started from the Dock earlier): just show it.
    if is_running(url):
        if not args.no_browser:
            open_window(url, args.tab)
        print(f"Blanks is already running at {url}", flush=True)
        return

    server = uvicorn.Server(uvicorn.Config("blanks.app:app", host="127.0.0.1", port=args.port, log_level="warning"))

    def open_when_ready() -> None:
        for _ in range(150):
            if server.started:
                open_window(url, args.tab)
                return
            time.sleep(0.2)

    def stop_when_idle(minutes: float) -> None:
        from . import app as app_module

        while not server.should_exit:
            time.sleep(15)
            if time.monotonic() - app_module.last_seen > minutes * 60:
                print("No Blanks window open for a while. Stopping.", flush=True)
                server.should_exit = True

    if not args.no_browser:
        threading.Thread(target=open_when_ready, daemon=True).start()
    if args.idle_exit:
        threading.Thread(target=stop_when_idle, args=(args.idle_exit,), daemon=True).start()

    print(f"Blanks is running at {url}  (Ctrl+C to stop)", flush=True)
    server.run()


if __name__ == "__main__":
    main()
