import Foundation
import Capacitor
import AuthenticationServices

/// Inline Capacitor plugin that runs Google OAuth via ASWebAuthenticationSession.
///
/// ASWebAuthenticationSession is Apple's purpose-built OAuth browser (iOS 12+). It:
///   - Shows a "Do you allow GarageFlo to sign in?" dialog before opening
///   - Runs in a sandboxed OS process separate from WKWebView (Google permits this;
///     it blocks WKWebView because it can't inspect session cookies there)
///   - Intercepts the app.garageflo:// redirect itself and returns the callback URL
///     directly to the completion handler — no appUrlOpen / SceneDelegate routing needed
///   - Does NOT modify the WKWebView's cookie storage, so the PKCE code_verifier stored
///     by signInWithOAuth(skipBrowserRedirect:true) is intact for exchangeCodeForSession
///
/// Registration: declared in GarageFloViewController.capacitorDidLoad via registerPluginType.
@objc(NativeAuthPlugin)
final class NativeAuthPlugin: CAPPlugin, CAPBridgedPlugin {

    // Required by CAPBridgedPlugin — used by the bridge to map JS calls to this class
    public let identifier = "NativeAuthPlugin"
    public let jsName = "NativeAuth"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "startWebAuthSession", returnType: CAPPluginReturnPromise)
    ]

    // Strong reference — ASWebAuthenticationSession deallocates if not retained
    private var authSession: ASWebAuthenticationSession?

    @objc func startWebAuthSession(_ call: CAPPluginCall) {
        guard
            let urlString = call.getString("url"),
            let url = URL(string: urlString),
            let callbackScheme = call.getString("callbackScheme")
        else {
            call.reject("INVALID_PARAMS", "url and callbackScheme are required")
            return
        }

        // ASWebAuthenticationSession must be presented from the main thread
        DispatchQueue.main.async { [weak self] in
            guard let self else {
                call.reject("PLUGIN_DEALLOC", "Plugin was deallocated before session could start")
                return
            }

            // Guard against a second tap while a session is already in progress.
            // The TypeScript side also prevents this via authInProgress ref, but
            // the Swift guard is the last line of defence.
            if self.authSession != nil {
                call.reject("SESSION_IN_PROGRESS", "An authentication session is already in progress")
                return
            }

            let session = ASWebAuthenticationSession(
                url: url,
                callbackURLScheme: callbackScheme
            ) { [weak self] callbackURL, error in
                defer { self?.authSession = nil }

                if let error {
                    if let sessionError = error as? ASWebAuthenticationSessionError,
                       sessionError.code == .canceledLogin {
                        // User tapped Cancel or dismissed — not an error
                        call.reject("USER_CANCELLED")
                    } else {
                        // Don't expose the raw error to logs — it may contain URL fragments
                        call.reject("AUTH_ERROR", error.localizedDescription)
                    }
                    return
                }

                guard let callbackURL else {
                    call.reject("NO_CALLBACK_URL", "Authentication completed but no callback URL was received")
                    return
                }

                // callbackURL.absoluteString contains the authorization code — resolve
                // it to TypeScript; the TS layer validates and extracts the code
                call.resolve(["url": callbackURL.absoluteString])
            }

            session.presentationContextProvider = self
            // false = reuse existing Google session from Safari (SSO UX for returning users)
            session.prefersEphemeralWebBrowserSession = false

            self.authSession = session

            guard session.start() else {
                self.authSession = nil
                call.reject("SESSION_START_FAILED", "ASWebAuthenticationSession could not be started")
                return
            }
        }
    }
}

// MARK: - ASWebAuthenticationPresentationContextProviding

extension NativeAuthPlugin: ASWebAuthenticationPresentationContextProviding {
    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        // Present over the key window; fall back to a new window if bridge is unavailable
        bridge?.viewController?.view.window ?? ASPresentationAnchor()
    }
}
