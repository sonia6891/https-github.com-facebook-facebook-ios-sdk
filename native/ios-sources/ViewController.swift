import UIKit
import Foundation
import Capacitor
import StoreKit
import UserNotifications

@objc(MeowStoreBillingPlugin)
public class MeowStoreBillingPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "MeowStoreBillingPlugin"
    public let jsName = "MeowStoreBilling"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getProducts", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "purchase", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "finishTransaction", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getUnfinishedTransactions", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "restorePurchases", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getCurrentEntitlements", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "manageSubscriptions", returnType: CAPPluginReturnPromise)
    ]

    private let productIDs: Set<String> = [
        "meowwork.pro.monthly",
        "meowwork.pro.yearly"
    ]

    private var transactionUpdatesTask: Task<Void, Never>?

    override public func load() {
        super.load()
        transactionUpdatesTask = Task { [weak self] in
            for await result in StoreKit.Transaction.updates {
                guard let self else { return }
                guard case .verified(let transaction) = result,
                      self.productIDs.contains(transaction.productID) else { continue }

                self.notifyListeners(
                    "transactionUpdated",
                    data: [
                        "platform": "ios",
                        "transaction": self.transactionPayload(transaction),
                        "signedTransaction": result.jwsRepresentation
                    ],
                    retainUntilConsumed: true
                )
            }
        }
    }

    deinit {
        transactionUpdatesTask?.cancel()
    }

    @objc func getProducts(_ call: CAPPluginCall) {
        Task {
            do {
                let products = try await Product.products(for: productIDs)
                let payload = products.map { product in
                    [
                        "id": product.id,
                        "displayName": product.displayName,
                        "displayPrice": product.displayPrice,
                        "description": product.description,
                        "eligibleForIntroOffer": product.subscription?.isEligibleForIntroOffer ?? false
                    ] as [String : Any]
                }
                call.resolve(["products": payload])
            } catch {
                call.reject("Unable to load App Store products", nil, error)
            }
        }
    }

    @objc func purchase(_ call: CAPPluginCall) {
        guard let productID = call.getString("productId"), productIDs.contains(productID) else {
            call.reject("Unknown product")
            return
        }

        guard let accountTokenString = call.getString("appAccountToken"),
              let accountToken = UUID(uuidString: accountTokenString) else {
            call.reject("Missing or invalid appAccountToken")
            return
        }

        Task {
            do {
                let products = try await Product.products(for: [productID])
                guard let product = products.first else {
                    call.reject("Product not found in App Store Connect or StoreKit test configuration")
                    return
                }

                let result = try await product.purchase(options: [.appAccountToken(accountToken)])
                switch result {
                case .success(let verification):
                    guard case .verified(let transaction) = verification else {
                        call.reject("App Store transaction could not be verified on device")
                        return
                    }

                    // Do NOT finish here. The web layer sends the JWS to the
                    // Supabase verifier first, then calls finishTransaction().
                    call.resolve([
                        "cancelled": false,
                        "platform": "ios",
                        "transaction": transactionPayload(transaction),
                        "signedTransaction": verification.jwsRepresentation
                    ])

                case .pending:
                    call.resolve([
                        "cancelled": false,
                        "pending": true,
                        "platform": "ios"
                    ])

                case .userCancelled:
                    call.resolve([
                        "cancelled": true,
                        "platform": "ios"
                    ])

                @unknown default:
                    call.reject("Unknown App Store purchase result")
                }
            } catch {
                call.reject("App Store purchase failed", nil, error)
            }
        }
    }

    @objc func finishTransaction(_ call: CAPPluginCall) {
        guard let rawID = call.getString("transactionId"),
              let transactionID = UInt64(rawID) else {
            call.reject("Missing or invalid transactionId")
            return
        }

        Task {
            for await result in StoreKit.Transaction.unfinished {
                guard case .verified(let transaction) = result else { continue }
                guard transaction.id == transactionID else { continue }
                await transaction.finish()
                call.resolve(["finished": true, "transactionId": rawID])
                return
            }
            // It may already be finished by a prior successful retry.
            call.resolve(["finished": true, "alreadyFinished": true, "transactionId": rawID])
        }
    }

    @objc func getUnfinishedTransactions(_ call: CAPPluginCall) {
        Task {
            var values: [[String: Any]] = []
            for await result in StoreKit.Transaction.unfinished {
                guard case .verified(let transaction) = result,
                      productIDs.contains(transaction.productID) else { continue }
                var payload = transactionPayload(transaction)
                payload["signedTransaction"] = result.jwsRepresentation
                values.append(payload)
            }
            call.resolve([
                "platform": "ios",
                "transactions": values
            ])
        }
    }

    @objc func restorePurchases(_ call: CAPPluginCall) {
        Task {
            do {
                try await AppStore.sync()
                let entitlements = await currentEntitlementPayloads()
                call.resolve([
                    "platform": "ios",
                    "entitlements": entitlements
                ])
            } catch {
                call.reject("Unable to restore App Store purchases", nil, error)
            }
        }
    }

    @objc func getCurrentEntitlements(_ call: CAPPluginCall) {
        Task {
            let entitlements = await currentEntitlementPayloads()
            call.resolve([
                "platform": "ios",
                "entitlements": entitlements
            ])
        }
    }

    @objc func manageSubscriptions(_ call: CAPPluginCall) {
        Task { @MainActor in
            do {
                guard let scene = bridge?.viewController?.view.window?.windowScene else {
                    call.reject("No active iOS window scene")
                    return
                }
                try await AppStore.showManageSubscriptions(in: scene)
                call.resolve(["opened": true, "platform": "ios"])
            } catch {
                call.reject("Unable to open App Store subscriptions", nil, error)
            }
        }
    }

    private func currentEntitlementPayloads() async -> [[String: Any]] {
        var values: [[String: Any]] = []
        for await result in StoreKit.Transaction.currentEntitlements {
            guard case .verified(let transaction) = result,
                  productIDs.contains(transaction.productID) else { continue }
            var payload = transactionPayload(transaction)
            payload["signedTransaction"] = result.jwsRepresentation
            values.append(payload)
        }
        return values
    }

    private func transactionPayload(_ transaction: StoreKit.Transaction) -> [String: Any] {
        var payload: [String: Any] = [
            "id": String(transaction.id),
            "originalID": String(transaction.originalID),
            "productId": transaction.productID,
            "purchaseDate": ISO8601DateFormatter().string(from: transaction.purchaseDate),
            "environment": String(describing: transaction.environment)
        ]
        if let expirationDate = transaction.expirationDate {
            payload["expirationDate"] = ISO8601DateFormatter().string(from: expirationDate)
        }
        if let revocationDate = transaction.revocationDate {
            payload["revocationDate"] = ISO8601DateFormatter().string(from: revocationDate)
        }
        return payload
    }
}


@objc(MeowReminderPlugin)
public class MeowReminderPlugin: CAPPlugin, CAPBridgedPlugin, UNUserNotificationCenterDelegate {
    public let identifier = "MeowReminderPlugin"
    public let jsName = "MeowReminder"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getPermissionStatus", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestPermission", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "schedule", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "cancel", returnType: CAPPluginReturnPromise)
    ]

    override public func load() {
        super.load()
        UNUserNotificationCenter.current().delegate = self
    }

    @objc func getPermissionStatus(_ call: CAPPluginCall) {
        UNUserNotificationCenter.current().getNotificationSettings { settings in
            let granted = settings.authorizationStatus == .authorized ||
                settings.authorizationStatus == .provisional ||
                settings.authorizationStatus == .ephemeral
            call.resolve([
                "granted": granted,
                "status": self.authorizationStatusName(settings.authorizationStatus)
            ])
        }
    }

    @objc func requestPermission(_ call: CAPPluginCall) {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { granted, error in
            if let error {
                call.reject("Unable to request notification permission", nil, error)
                return
            }
            UNUserNotificationCenter.current().getNotificationSettings { settings in
                call.resolve([
                    "granted": granted,
                    "status": self.authorizationStatusName(settings.authorizationStatus)
                ])
            }
        }
    }

    @objc func schedule(_ call: CAPPluginCall) {
        guard let id = call.getString("id"), !id.isEmpty else {
            call.reject("Missing reminder id")
            return
        }
        guard let title = call.getString("title"), !title.isEmpty else {
            call.reject("Missing reminder title")
            return
        }
        guard let fireAt = call.getString("fireAt"),
              let fireDate = parseISODate(fireAt) else {
            call.reject("Missing or invalid reminder fireAt")
            return
        }

        let center = UNUserNotificationCenter.current()
        if fireDate <= Date() {
            center.removePendingNotificationRequests(withIdentifiers: [id])
            call.resolve([
                "scheduled": false,
                "past": true,
                "id": id
            ])
            return
        }

        let content = UNMutableNotificationContent()
        content.title = title
        content.body = call.getString("body") ?? ""
        content.sound = .default
        content.threadIdentifier = "meow-work-reminders"
        var userInfo: [AnyHashable: Any] = [:]
        if let kind = call.getString("kind") { userInfo["kind"] = kind }
        if let itemId = call.getString("itemId") { userInfo["itemId"] = itemId }
        content.userInfo = userInfo

        let interval = max(1, fireDate.timeIntervalSinceNow)
        let trigger = UNTimeIntervalNotificationTrigger(timeInterval: interval, repeats: false)
        let request = UNNotificationRequest(identifier: id, content: content, trigger: trigger)

        center.removePendingNotificationRequests(withIdentifiers: [id])
        center.add(request) { error in
            if let error {
                call.reject("Unable to schedule local reminder", nil, error)
                return
            }
            call.resolve([
                "scheduled": true,
                "id": id,
                "fireAt": fireAt
            ])
        }
    }

    @objc func cancel(_ call: CAPPluginCall) {
        guard let id = call.getString("id"), !id.isEmpty else {
            call.reject("Missing reminder id")
            return
        }
        let center = UNUserNotificationCenter.current()
        center.removePendingNotificationRequests(withIdentifiers: [id])
        center.removeDeliveredNotifications(withIdentifiers: [id])
        call.resolve([
            "cancelled": true,
            "id": id
        ])
    }

    public func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        completionHandler([.banner, .list, .sound])
    }

    private func parseISODate(_ value: String) -> Date? {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = formatter.date(from: value) { return date }
        formatter.formatOptions = [.withInternetDateTime]
        return formatter.date(from: value)
    }

    private func authorizationStatusName(_ status: UNAuthorizationStatus) -> String {
        switch status {
        case .notDetermined: return "notDetermined"
        case .denied: return "denied"
        case .authorized: return "authorized"
        case .provisional: return "provisional"
        case .ephemeral: return "ephemeral"
        @unknown default: return "unknown"
        }
    }
}


final class ViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(MeowStoreBillingPlugin())
        bridge?.registerPluginInstance(MeowReminderPlugin())
    }
}
