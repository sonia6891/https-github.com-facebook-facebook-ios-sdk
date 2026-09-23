import UIKit
import Foundation
import Capacitor
import StoreKit

@objc(MeowStoreBillingPlugin)
public class MeowStoreBillingPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "MeowStoreBillingPlugin"
    public let jsName = "MeowStoreBilling"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getProducts", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "purchase", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "restorePurchases", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getCurrentEntitlements", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "manageSubscriptions", returnType: CAPPluginReturnPromise)
    ]

    private let productIDs: Set<String> = [
        "meowwork.pro.monthly",
        "meowwork.pro.yearly"
    ]

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

        Task {
            do {
                let products = try await Product.products(for: [productID])
                guard let product = products.first else {
                    call.reject("Product not found in App Store Connect")
                    return
                }

                let result = try await product.purchase()
                switch result {
                case .success(let verification):
                    guard case .verified(let transaction) = verification else {
                        call.reject("App Store transaction could not be verified")
                        return
                    }

                    let response = transactionPayload(transaction)
                    await transaction.finish()
                    call.resolve([
                        "cancelled": false,
                        "platform": "ios",
                        "transaction": response
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
        for await result in Transaction.currentEntitlements {
            guard case .verified(let transaction) = result,
                  productIDs.contains(transaction.productID) else { continue }
            values.append(transactionPayload(transaction))
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


final class ViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(MeowStoreBillingPlugin())
    }
}
