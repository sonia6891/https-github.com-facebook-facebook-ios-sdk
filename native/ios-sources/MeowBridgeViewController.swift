import UIKit
import Capacitor

final class MeowBridgeViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(MeowStoreBillingPlugin())
        bridge?.registerPluginInstance(MeowReminderPlugin())
    }
}
