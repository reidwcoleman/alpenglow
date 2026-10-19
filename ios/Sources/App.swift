import UIKit
import WebKit

// Shredline is a web game. The app plays the live site (so it's always the latest version,
// with accounts, leaderboards and multiplayer) and, with no connection, the copy bundled in
// the app, served over a custom scheme so its ES modules load. Landscape only.

@main
final class AppDelegate: UIResponder, UIApplicationDelegate {
    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool { true }
    func application(_ application: UIApplication, configurationForConnecting connectingSceneSession: UISceneSession, options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        let cfg = UISceneConfiguration(name: "Main", sessionRole: connectingSceneSession.role)
        cfg.delegateClass = SceneDelegate.self
        return cfg
    }
}

extension UIFont {
    func italic() -> UIFont {
        guard let d = fontDescriptor.withSymbolicTraits([.traitItalic, .traitBold]) else { return self }
        return UIFont(descriptor: d, size: pointSize)
    }
}

final class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?
    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let ws = scene as? UIWindowScene else { return }
        let w = UIWindow(windowScene: ws)
        w.rootViewController = GameViewController()
        w.makeKeyAndVisible()
        window = w
    }
}

// the bundled copy of the game, at shredline://app/
final class BundleSchemeHandler: NSObject, WKURLSchemeHandler {
    static let scheme = "shredline"
    private let root = Bundle.main.resourceURL!.appendingPathComponent("Web")
    private let types: [String: String] = [
        "html": "text/html", "js": "text/javascript", "mjs": "text/javascript", "css": "text/css", "json": "application/json",
        "png": "image/png", "jpg": "image/jpeg", "webp": "image/webp", "svg": "image/svg+xml", "hdr": "application/octet-stream",
        "woff2": "font/woff2", "woff": "font/woff", "wasm": "application/wasm", "glb": "model/gltf-binary", "mp3": "audio/mpeg",
    ]

    func webView(_ webView: WKWebView, start task: WKURLSchemeTask) {
        guard let url = task.request.url else { return }
        var path = url.path
        if path.isEmpty || path == "/" { path = "/index.html" }
        let file = root.appendingPathComponent(String(path.dropFirst()))
        guard let data = FileManager.default.contents(atPath: file.path) else {
            task.didReceive(HTTPURLResponse(url: url, statusCode: 404, httpVersion: "HTTP/1.1", headerFields: nil)!)
            task.didFinish(); return
        }
        let mime = types[file.pathExtension.lowercased()] ?? "application/octet-stream"
        let resp = HTTPURLResponse(url: url, statusCode: 200, httpVersion: "HTTP/1.1", headerFields: ["Content-Type": mime, "Content-Length": "\(data.count)", "Access-Control-Allow-Origin": "*"])!
        task.didReceive(resp); task.didReceive(data); task.didFinish()
    }
    func webView(_ webView: WKWebView, stop task: WKURLSchemeTask) {}
}

// the page tells the app when its own loading screen is up (so the native splash can go)
final class PageMessages: NSObject, WKScriptMessageHandler {
    var onLoading: (() -> Void)?
    func userContentController(_ c: WKUserContentController, didReceive message: WKScriptMessage) {
        if message.body as? String == "loading" { onLoading?() }
    }
}

final class GameViewController: UIViewController, WKNavigationDelegate, WKUIDelegate {
    private static let live = URL(string: "https://reidwcoleman.github.io/alpenglow/?app=1")!
    private static let offline = URL(string: "\(BundleSchemeHandler.scheme)://app/index.html?app=1")!
    private var web: WKWebView!
    private var usingOffline = false
    private var splash: UIView?
    private let messages = PageMessages()
    override var prefersStatusBarHidden: Bool { true }
    override var prefersHomeIndicatorAutoHidden: Bool { true }
    override var preferredScreenEdgesDeferringSystemGestures: UIRectEdge { .all }
    override var supportedInterfaceOrientations: UIInterfaceOrientationMask { .landscape }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(red: 0.043, green: 0.055, blue: 0.086, alpha: 1)
        let cfg = WKWebViewConfiguration()
        cfg.setURLSchemeHandler(BundleSchemeHandler(), forURLScheme: BundleSchemeHandler.scheme)
        cfg.allowsInlineMediaPlayback = true
        cfg.mediaTypesRequiringUserActionForPlayback = []
        cfg.websiteDataStore = .default()
        cfg.userContentController.add(messages, name: "shredline")
        messages.onLoading = { [weak self] in self?.hideSplash() }
        web = WKWebView(frame: view.bounds, configuration: cfg)
        web.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        web.scrollView.isScrollEnabled = false
        web.scrollView.bounces = false
        web.scrollView.contentInsetAdjustmentBehavior = .never
        web.allowsBackForwardNavigationGestures = false
        web.isOpaque = false
        web.backgroundColor = view.backgroundColor
        web.navigationDelegate = self
        web.uiDelegate = self
        #if DEBUG
        if #available(iOS 16.4, *) { web.isInspectable = true }
        #endif
        view.addSubview(web)
        showSplash()
        web.load(URLRequest(url: Self.live, cachePolicy: .useProtocolCachePolicy, timeoutInterval: 12))
    }

    // the same picture and name the page's loading screen opens with, from the bundled copy,
    // up from the first frame until the page has painted its own
    private func showSplash() {
        let v = UIView(frame: view.bounds)
        v.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        v.backgroundColor = view.backgroundColor
        let art = Bundle.main.resourceURL!.appendingPathComponent("Web/art/yard.webp")
        if let img = UIImage(contentsOfFile: art.path) {
            let iv = UIImageView(image: img)
            iv.frame = v.bounds; iv.autoresizingMask = [.flexibleWidth, .flexibleHeight]
            iv.contentMode = .scaleAspectFill; iv.clipsToBounds = true
            v.addSubview(iv)
            let shade = CAGradientLayer()
            shade.frame = CGRect(x: 0, y: 0, width: max(view.bounds.width, view.bounds.height), height: max(view.bounds.width, view.bounds.height))
            shade.colors = [UIColor(white: 0.03, alpha: 0.55).cgColor, UIColor(white: 0.03, alpha: 0.05).cgColor, UIColor(white: 0.03, alpha: 0.85).cgColor]
            shade.locations = [0, 0.4, 1]
            iv.layer.addSublayer(shade)
        }
        let title = UILabel()
        title.text = "SHREDLINE"
        title.font = UIFont.systemFont(ofSize: 56, weight: .black).italic()
        title.textColor = .white
        title.layer.shadowColor = UIColor.black.cgColor; title.layer.shadowOpacity = 0.35; title.layer.shadowRadius = 10; title.layer.shadowOffset = .zero
        title.translatesAutoresizingMaskIntoConstraints = false
        v.addSubview(title)
        let spin = UIActivityIndicatorView(style: .medium)
        spin.color = .white; spin.startAnimating()
        spin.translatesAutoresizingMaskIntoConstraints = false
        v.addSubview(spin)
        NSLayoutConstraint.activate([
            title.leadingAnchor.constraint(equalTo: v.safeAreaLayoutGuide.leadingAnchor, constant: 28),
            title.topAnchor.constraint(equalTo: v.safeAreaLayoutGuide.topAnchor, constant: 20),
            spin.trailingAnchor.constraint(equalTo: v.safeAreaLayoutGuide.trailingAnchor, constant: -28),
            spin.bottomAnchor.constraint(equalTo: v.safeAreaLayoutGuide.bottomAnchor, constant: -22),
        ])
        view.addSubview(v)
        splash = v
        // (never longer than this, whatever the page does)
        DispatchQueue.main.asyncAfter(deadline: .now() + 8) { [weak self] in self?.hideSplash() }
    }

    private func hideSplash() {
        guard let v = splash else { return }
        splash = nil
        UIView.animate(withDuration: 0.35, delay: 0.1, options: [.curveEaseOut], animations: { v.alpha = 0 }, completion: { _ in v.removeFromSuperview() })
    }

    private func goOffline() {
        guard !usingOffline else { return }
        usingOffline = true
        web.load(URLRequest(url: Self.offline))
    }

    // no connection (or the site is down): the bundled copy
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { goOffline() }
    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        if (error as NSError).code != NSURLErrorCancelled, webView.url?.scheme == "https", webView.estimatedProgress < 0.5 { goOffline() }
    }
    // links that leave the game (credits, password resets) open in Safari
    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        if let url = action.request.url, action.navigationType == .linkActivated, url.host != Self.live.host, url.scheme != BundleSchemeHandler.scheme {
            UIApplication.shared.open(url); decisionHandler(.cancel); return
        }
        decisionHandler(.allow)
    }
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = action.request.url { UIApplication.shared.open(url) }
        return nil
    }
    // if WebKit's content process is killed (memory pressure), bring the game back
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) { webView.reload() }
}
