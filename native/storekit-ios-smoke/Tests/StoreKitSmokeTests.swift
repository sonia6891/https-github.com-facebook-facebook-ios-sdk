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

        let beforeRestartValue = await unfinishedTransaction(id: transaction.id)
        let beforeRestart = try XCTUnwrap(beforeRestartValue)
        XCTAssertEqual(beforeRestart.transaction.appAccountToken, accountToken)

        // SKTestSession instances share the same StoreKit test environment.
        // Recreate the session without clearing transactions to simulate an app/test restart.
        session = try SKTestSession(contentsOf: configurationURL)
        session.disableDialogs = true

        let afterRestartValue = await unfinishedTransaction(id: transaction.id)
        let afterRestart = try XCTUnwrap(afterRestartValue)
        XCTAssertEqual(afterRestart.transaction.productID, Self.monthlyProductID)
        XCTAssertEqual(afterRestart.transaction.appAccountToken, accountToken)

        await afterRestart.transaction.finish()
        let afterFinish = await unfinishedTransaction(id: transaction.id)
        XCTAssertNil(afterFinish)
    }

    func testFinishedEntitlementSurvivesNewTestSession() async throws {
        let accountToken = UUID()
        let transaction = try await session.buyProduct(
            identifier: Self.monthlyProductID,
            options: [.appAccountToken(accountToken)]
        )
        await transaction.finish()

        session = try SKTestSession(contentsOf: configurationURL)
        session.disableDialogs = true

        let restoredValue = await currentEntitlement(productID: Self.monthlyProductID)
        let restored = try XCTUnwrap(restoredValue)
        XCTAssertEqual(restored.productID, Self.monthlyProductID)
        XCTAssertEqual(restored.appAccountToken, accountToken)
    }

    func testCancelAutoRenewKeepsPeriodThenExpirationIsApplied() async throws {
        let transaction = try await session.buyProduct(
            identifier: Self.monthlyProductID,
            options: [.appAccountToken(UUID())]
        )
        await transaction.finish()

        try session.disableAutoRenewForTransaction(identifier: UInt(transaction.id))

        let afterCancel = try XCTUnwrap(
            session.allTransactions().last(where: {
                $0.productIdentifier == Self.monthlyProductID
            })
        )
        XCTAssertFalse(afterCancel.autoRenewingEnabled)
        let preExpireDate = try XCTUnwrap(afterCancel.expirationDate)
        XCTAssertGreaterThan(preExpireDate, Date().addingTimeInterval(-2))

        try session.expireSubscription(productIdentifier: Self.monthlyProductID)

        let afterExpire = try XCTUnwrap(
            session.allTransactions().last(where: {
                $0.productIdentifier == Self.monthlyProductID
            })
        )
        XCTAssertFalse(afterExpire.autoRenewingEnabled)
        let expirationDate = try XCTUnwrap(afterExpire.expirationDate)
        XCTAssertLessThanOrEqual(expirationDate, Date().addingTimeInterval(2))
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
