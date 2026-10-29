// Blanks for macOS: a native window around the local Blanks server.
//
// Built by scripts/make_mac_app.sh. On launch it starts the server from the
// Blanks checkout (unless one is already running), shows the app in a
// WKWebView, and stops the server it started when you quit. File pickers,
// confirm dialogs and downloads go through the usual Mac panels, and
// downloads land in ~/Downloads.

import AppKit
import WebKit

let port = 8765
let home = URL(string: "http://127.0.0.1:\(port)/")!
let logURL = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Library/Logs/Blanks.log")

final class AppDelegate: NSObject, NSApplicationDelegate, WKNavigationDelegate, WKUIDelegate, WKDownloadDelegate {
    var window: NSWindow!
    var web: WKWebView!
    var server: Process?

    // MARK: launch and quit

    func applicationDidFinishLaunching(_ note: Notification) {
        buildMenu()

        let config = WKWebViewConfiguration()
        config.preferences.javaScriptCanOpenWindowsAutomatically = false
        web = WKWebView(frame: .zero, configuration: config)
        web.navigationDelegate = self
        web.uiDelegate = self
        web.setValue(false, forKey: "drawsBackground") // no white flash while loading

        window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 1320, height: 900),
            styleMask: [.titled, .closable, .miniaturizable, .resizable],
            backing: .buffered, defer: false)
        window.title = "Blanks"
        window.minSize = NSSize(width: 900, height: 600)
        window.tabbingMode = .disallowed
        window.backgroundColor = NSColor(red: 0.957, green: 0.965, blue: 0.976, alpha: 1)
        window.contentView = web
        window.center()
        window.setFrameAutosaveName("BlanksMain")
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)

        web.loadHTMLString(Self.page("Starting Blanks…", detail: ""), baseURL: nil)
        Task { await self.connect() }
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ app: NSApplication) -> Bool { true }

    func applicationWillTerminate(_ note: Notification) {
        // Stop only the server this app started; uv passes the signal on to Python.
        guard let server, server.isRunning else { return }
        server.interrupt()
        let deadline = Date().addingTimeInterval(3)
        while server.isRunning && Date() < deadline { usleep(50_000) }
        if server.isRunning { server.terminate() }
    }

    // MARK: the server

    func isUp() async -> Bool {
        var req = URLRequest(url: home.appendingPathComponent("api/ping"), timeoutInterval: 1)
        req.setValue("1", forHTTPHeaderField: "X-Blanks")
        guard let (_, res) = try? await URLSession.shared.data(for: req) else { return false }
        return (res as? HTTPURLResponse)?.statusCode == 200
    }

    @MainActor func connect() async {
        if await !isUp() {
            do { try startServer() } catch {
                show("Blanks couldn't start", detail: error.localizedDescription)
                return
            }
            // The first run builds the interface, which can take a minute.
            for _ in 0..<240 {
                if await isUp() { break }
                if let s = server, !s.isRunning { break }
                try? await Task.sleep(nanoseconds: 500_000_000)
            }
        }
        if await isUp() {
            web.load(URLRequest(url: home))
        } else {
            show("Blanks couldn't start", detail: "Details are in \(logURL.path)")
        }
    }

    func startServer() throws {
        let info = Bundle.main.infoDictionary ?? [:]
        guard let repo = info["BlanksRepo"] as? String,
              FileManager.default.isExecutableFile(atPath: repo + "/start") else {
            throw NSError(domain: "Blanks", code: 1, userInfo: [NSLocalizedDescriptionKey:
                "Can't find the Blanks folder. Run scripts/make_mac_app.sh again from it."])
        }
        var env = ProcessInfo.processInfo.environment
        let extra = (info["BlanksPath"] as? String) ?? ""
        env["PATH"] = [extra, env["PATH"] ?? "/usr/bin:/bin"].filter { !$0.isEmpty }.joined(separator: ":")

        if !FileManager.default.fileExists(atPath: logURL.path) {
            FileManager.default.createFile(atPath: logURL.path, contents: nil)
        }
        let log = try FileHandle(forWritingTo: logURL)
        log.seekToEndOfFile()

        let p = Process()
        p.executableURL = URL(fileURLWithPath: "/bin/sh")
        // --idle-exit is a safety net: if this app ever dies without quitting,
        // the server still stops once no window has pinged it for a while.
        p.arguments = [repo + "/start", "--no-browser", "--idle-exit", "10"]
        p.currentDirectoryURL = URL(fileURLWithPath: repo)
        p.environment = env
        p.standardOutput = log
        p.standardError = log
        try p.run()
        server = p
    }

    func show(_ title: String, detail: String) {
        web.loadHTMLString(Self.page(title, detail: detail), baseURL: nil)
    }

    static func page(_ title: String, detail: String) -> String {
        let esc = { (s: String) in s.replacingOccurrences(of: "&", with: "&amp;").replacingOccurrences(of: "<", with: "&lt;") }
        return """
        <!doctype html><meta charset="utf-8"><style>
        html,body{height:100%;margin:0}
        body{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;
        font:15px -apple-system,system-ui,sans-serif;color:#111827;letter-spacing:-.01em;
        background:radial-gradient(600px 600px at 88% 6%,rgba(239,68,68,.42),transparent 70%),
        radial-gradient(640px 640px at 6% 96%,rgba(252,165,165,.5),transparent 70%),#f4f6f9}
        h1{font-size:22px;font-weight:500;margin:0}p{margin:0;color:#4b5563}
        </style><h1>\(esc(title))</h1><p>\(esc(detail))</p>
        """
    }

    // MARK: navigation: stay on Blanks, open everything else in the browser

    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        if action.shouldPerformDownload { return decisionHandler(.download) }
        if let url = action.request.url, ["http", "https"].contains(url.scheme ?? ""),
           !["127.0.0.1", "localhost"].contains(url.host ?? "") {
            NSWorkspace.shared.open(url)
            return decisionHandler(.cancel)
        }
        decisionHandler(.allow)
    }

    func webView(_ webView: WKWebView, decidePolicyFor response: WKNavigationResponse,
                 decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void) {
        decisionHandler(response.canShowMIMEType ? .allow : .download)
    }

    func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) {
        download.delegate = self
    }

    func webView(_ webView: WKWebView, navigationResponse: WKNavigationResponse, didBecome download: WKDownload) {
        download.delegate = self
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        webView.reload()
    }

    // MARK: downloads go straight to ~/Downloads

    func download(_ download: WKDownload, decideDestinationUsing response: URLResponse,
                  suggestedFilename: String, completionHandler: @escaping (URL?) -> Void) {
        let folder = FileManager.default.urls(for: .downloadsDirectory, in: .userDomainMask)[0]
        let base = (suggestedFilename as NSString).deletingPathExtension
        let ext = (suggestedFilename as NSString).pathExtension
        var dest = folder.appendingPathComponent(suggestedFilename)
        var n = 2
        while FileManager.default.fileExists(atPath: dest.path) {
            dest = folder.appendingPathComponent("\(base) \(n)" + (ext.isEmpty ? "" : ".\(ext)"))
            n += 1
        }
        completionHandler(dest)
    }

    func downloadDidFinish(_ download: WKDownload) {
        // Makes the Downloads stack in the Dock bounce, like a browser download.
        DistributedNotificationCenter.default().post(name: .init("com.apple.DownloadFileFinished"), object: nil)
    }

    func download(_ download: WKDownload, didFailWithError error: Error, resumeData: Data?) {
        alert("The download failed", error.localizedDescription)
    }

    // MARK: panels the page asks for

    func webView(_ webView: WKWebView, runOpenPanelWith parameters: WKOpenPanelParameters,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping ([URL]?) -> Void) {
        let panel = NSOpenPanel()
        panel.allowedContentTypes = [.pdf]
        panel.allowsMultipleSelection = parameters.allowsMultipleSelection
        panel.canChooseDirectories = false
        panel.beginSheetModal(for: window) { completionHandler($0 == .OK ? panel.urls : nil) }
    }

    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        alert(message, "")
        completionHandler()
    }

    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        let a = NSAlert()
        a.messageText = message
        a.addButton(withTitle: "OK")
        a.addButton(withTitle: "Cancel")
        completionHandler(a.runModal() == .alertFirstButtonReturn)
    }

    func alert(_ title: String, _ detail: String) {
        let a = NSAlert()
        a.messageText = title
        a.informativeText = detail
        a.runModal()
    }

    // MARK: menus (the Edit menu is what makes copy and paste work)

    @objc func reloadPage(_ sender: Any?) { web.reload() }

    func buildMenu() {
        let main = NSMenu()

        let appItem = NSMenuItem()
        let appMenu = NSMenu()
        appMenu.addItem(withTitle: "About Blanks", action: #selector(NSApplication.orderFrontStandardAboutPanel(_:)), keyEquivalent: "")
        appMenu.addItem(.separator())
        appMenu.addItem(withTitle: "Hide Blanks", action: #selector(NSApplication.hide(_:)), keyEquivalent: "h")
        let others = appMenu.addItem(withTitle: "Hide Others", action: #selector(NSApplication.hideOtherApplications(_:)), keyEquivalent: "h")
        others.keyEquivalentModifierMask = [.command, .option]
        appMenu.addItem(.separator())
        appMenu.addItem(withTitle: "Quit Blanks", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        appItem.submenu = appMenu
        main.addItem(appItem)

        let editItem = NSMenuItem()
        let edit = NSMenu(title: "Edit")
        edit.addItem(withTitle: "Undo", action: Selector(("undo:")), keyEquivalent: "z")
        let redo = edit.addItem(withTitle: "Redo", action: Selector(("redo:")), keyEquivalent: "z")
        redo.keyEquivalentModifierMask = [.command, .shift]
        edit.addItem(.separator())
        edit.addItem(withTitle: "Cut", action: #selector(NSText.cut(_:)), keyEquivalent: "x")
        edit.addItem(withTitle: "Copy", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
        edit.addItem(withTitle: "Paste", action: #selector(NSText.paste(_:)), keyEquivalent: "v")
        edit.addItem(withTitle: "Select All", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")
        editItem.submenu = edit
        main.addItem(editItem)

        let viewItem = NSMenuItem()
        let view = NSMenu(title: "View")
        view.addItem(withTitle: "Reload", action: #selector(reloadPage(_:)), keyEquivalent: "r")
        let full = view.addItem(withTitle: "Enter Full Screen", action: #selector(NSWindow.toggleFullScreen(_:)), keyEquivalent: "f")
        full.keyEquivalentModifierMask = [.command, .control]
        viewItem.submenu = view
        main.addItem(viewItem)

        let windowItem = NSMenuItem()
        let windowMenu = NSMenu(title: "Window")
        windowMenu.addItem(withTitle: "Minimize", action: #selector(NSWindow.performMiniaturize(_:)), keyEquivalent: "m")
        windowMenu.addItem(withTitle: "Close", action: #selector(NSWindow.performClose(_:)), keyEquivalent: "w")
        windowItem.submenu = windowMenu
        main.addItem(windowItem)
        NSApp.windowsMenu = windowMenu

        NSApp.mainMenu = main
    }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.regular)
app.run()
