import Capacitor

/// Root view controller for the GarageFlo iOS app.
/// Extends CAPBridgeViewController to register inline Capacitor plugins that live in the
/// App target rather than in the CapApp-SPM package (which is CLI-managed and cannot be edited).
final class GarageFloViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginType(NativeAuthPlugin.self)
    }
}
