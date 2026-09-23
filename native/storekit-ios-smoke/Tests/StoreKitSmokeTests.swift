import Foundation
import StoreKit
import StoreKitTest
import XCTest

final class StoreKitSmokeTests: XCTestCase {
    private var session: SKTestSession!
    private var configurationURL: URL!

    private static let monthlyProductID = "meowwork.pro.monthly"
    private static let yearlyProductID = "meowwork.pro.yearly"
    private static let productIDs: Set<String> = [
        monthlyProductID,
        yearlyProductID
    ]

    override func setUpWithError() throws {
        continueAfterFailure = false

        configurationURL = try XCTUnwrap(
            Bundle(for: Self.self).url(
                forResource: "MeowWork",
                withExtension: "storekit"
            )
        )

        session = try SKTestSession(contentsOf: configurationURL)
        session.disableDialogs = true
        session.resetToDefaultState()
        session.clearTransactions()
    }

    override func tearDownWithError() throws {
        session?.resetToDefaultState()
        session?.clearTransactions()
        session = nil
        configurationURL = nil
    }

    func testProductsExposeThreeDayFreeTrial() async throws {
        let products = try await Product.products(for: Self.productIDs)
        XCTAssertEqual(Set(products.map(\.id)), Self.productIDs)

        for product in products {
            let subscription = try XCTUnwrap(product.subscription)
            let offer = try XCTUnwrap(subscription.introductoryOffer)

            XCTAssertEqual(offer.paymentMode, .freeTrial)
            XCTAssertEqual(offer.period.value, 3)
            XCTAssertEqual(offer.period.unit, .day)

            let eligible = await subscription.isEligibleForIntroOffer
            XCTAssertTrue(eligible)
        }
    }

    func testMonthlyPurchaseRemainsUnfinishedUntilExplicitFinish() async throws {
        let accountToken = UUID()
        let transaction = try await session.buyProduct(
            identifier: Self.monthlyProductID,
            options: [.appAccountToken(accountToken)]
        )

        XCTAssertEqual(transaction.productID, Self.monthlyProductID)
        XCTAssertEqual(transaction.appAccountToken, accountToken)

        let unfinishedValue = await unfinishedTransaction(id: transaction.id)
        let unfinished = try XCTUnwrap(unfinishedValue)
        XCTAssertEqual(unfinished.transaction.appAccountToken, accountToken)
        XCTAssertFalse(unfinished.jwsRepresentation.isEmpty)

        await transaction.finish()

        let afterFinish = await unfinishedTransaction(id: transaction.id)
        XCTAssertNil(afterFinish)
    }

    func testYearlyPurchaseCarriesAccountTokenAndCanFinish() async throws {
        let accountToken = UUID()
        let transaction = try await session.buyProduct(
            identifier: Self.yearlyProductID,
            options: [.appAccountToken(accountToken)]
        )

        XCTAssertEqual(transaction.productID, Self.yearlyProductID)
        XCTAssertEqual(transaction.appAccountToken, accountToken)

        let unfinishedValue = await unfinishedTransaction(id: transaction.id)
        let unfinished = try XCTUnwrap(unfinishedValue)
        XCTAssertFalse(unfinished.jwsRepresentation.isEmpty)

        await transaction.finish()

        let afterFinish = await unfinishedTransaction(id: transaction.id)
        XCTAssertNil(afterFinish)
    }

    func testUnfinishedTransactionSurvivesNewTestSession() async throws {
        let accountToken = UUID()
        let transaction = try await session.buyProduct(
            identifier: Self.monthlyProductID,
            options: [.appAccountToken(accountToken)]
        )

        let beforeRestart = try XCTUnwrap(
            await unfinishedTransaction(id: transaction.id)
        )
        XCTAssertEqual(beforeRestart.transaction.appAccountToken, accountToken)

        // SKTestSession instances share the same StoreKit test environment.
        // Recreate the session without clearing transactions to simulate an app/test restart.
        session = try SKTestSession(contentsOf: configurationURL)
        session.disableDialogs = true

        let afterRestart = try XCTUnwrap(
            await unfinishedTransaction(id: transaction.id)
        )
        XCTAssertEqual(afterRestart.transaction.productID, Self.monthlyProductID)
        XCTAssertEqual(afterRestart.transaction.appAccountToken, accountToken)

        await afterRestart.transaction.finish()
        XCTAssertNil(await unfinishedTransaction(id: transaction.id))
    }

    func testRestoreSyncKeepsActiveEntitlement() async throws {
        let accountToken = UUID()
        let transaction = try await session.buyProduct(
            identifier: Self.monthlyProductID,
            options: [.appAccountToken(accountToken)]
        )
        await transaction.finish()

        try await AppStore.sync()

        let restored = try XCTUnwrap(
            await currentEntitlement(productID: Self.monthlyProductID)
        )
        XCTAssertEqual(restored.productID, Self.monthlyProductID)
        XCTAssertEqual(restored.appAccountToken, accountToken)
    }

    func testCancelAutoRenewKeepsAccessUntilExpirationThenRemovesEntitlement() async throws {
        let transaction = try await session.buyProduct(
            identifier: Self.monthlyProductID,
            options: [.appAccountToken(UUID())]
        )
        await transaction.finish()

        try session.disableAutoRenewForTransaction(identifier: Int(transaction.id))

        let stillActive = await currentEntitlement(productID: Self.monthlyProductID)
        XCTAssertNotNil(stillActive)

        try session.expireSubscription(productIdentifier: Self.monthlyProductID)

        let afterExpiration = await currentEntitlement(productID: Self.monthlyProductID)
        XCTAssertNil(afterExpiration)
    }

    func testForcedPurchaseFailureDoesNotCreateUnfinishedOrActiveEntitlement() async throws {
        session.failTransactionsEnabled = true

        do {
            let transaction = try await session.buyProduct(
                identifier: Self.monthlyProductID,
                options: [.appAccountToken(UUID())]
            )
            await transaction.finish()
            XCTFail("Expected StoreKit test purchase to fail")
        } catch {
            // Expected: forced transaction failure must not grant entitlement.
        }

        XCTAssertNil(await unfinishedTransaction(productID: Self.monthlyProductID))
        XCTAssertNil(await currentEntitlement(productID: Self.monthlyProductID))
    }

    private func unfinishedTransaction(
        id: UInt64
    ) async -> (transaction: StoreKit.Transaction, jwsRepresentation: String)? {
        for await result in StoreKit.Transaction.unfinished {
            guard case .verified(let transaction) = result,
                  transaction.id == id else {
                continue
            }

            return (transaction, result.jwsRepresentation)
        }

        return nil
    }

    private func unfinishedTransaction(
        productID: String
    ) async -> StoreKit.Transaction? {
        for await result in StoreKit.Transaction.unfinished {
            guard case .verified(let transaction) = result,
                  transaction.productID == productID else {
                continue
            }
            return transaction
        }
        return nil
    }

    private func currentEntitlement(
        productID: String
    ) async -> StoreKit.Transaction? {
        for await result in StoreKit.Transaction.currentEntitlements {
            guard case .verified(let transaction) = result,
                  transaction.productID == productID else {
                continue
            }
            return transaction
        }
        return nil
    }
}
