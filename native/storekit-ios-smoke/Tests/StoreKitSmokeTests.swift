import Foundation
import StoreKit
import StoreKitTest
import XCTest

final class StoreKitSmokeTests: XCTestCase {
    private var session: SKTestSession!

    private static let monthlyProductID = "meowwork.pro.monthly"
    private static let yearlyProductID = "meowwork.pro.yearly"
    private static let productIDs: Set<String> = [
        monthlyProductID,
        yearlyProductID
    ]

    override func setUpWithError() throws {
        continueAfterFailure = false

        let configurationURL = try XCTUnwrap(
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
        session.clearTransactions()
        session = nil
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
}
