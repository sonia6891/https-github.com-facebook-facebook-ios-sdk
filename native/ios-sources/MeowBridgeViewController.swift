import UIKit
import Capacitor

final class MeowBridgeViewController: CAPBridgeViewController {
    override public func capacitorDidLoad() {
        bridge?.registerPluginInstance(MeowStoreBillingPlugin())
        bridge?.registerPluginInstance(MeowReminderPlugin())
        bridge?.registerPluginInstance(MeowSpeechPlugin())
    }
}
