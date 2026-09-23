import Foundation
import StoreKit
import StoreKitTest
import XCTest
@testable import MeowStoreKitSmokeSupport

final class StoreKitSmokeTests: XCTestCase {
    private var session: SKTestSession!

    private static let productIDs: Set<String> = [
        MeowStoreKitSmokeSupport.monthlyProductID,
        MeowStoreKitSmokeSupport.yearlyProductID
    ]

    private static var configurationURL: URL {
        var url = URL(fileURLWithPath: #filePath)
        for _ in 0..<4 {
            url.deleteLastPathComponent()
        }
        return url.appendingPathComponent("ios-sources/MeowWork.storekit")
    }

    override func setUpWithError() throws {
        continueAfterFailure = false
        session = try SKTestSession(contentsOf: Self.configurationURL)
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
            XCTAssertTrue(subscription.isEligibleForIntroOffer)
        }
    }

    func testMonthlyPurchaseRemainsUnfinishedUntilExplicitFinish() async throws {
        let accountToken = UUID()
        let transaction = try await session.buyProduct(
            identifier: MeowStoreKitSmokeSupport.monthlyProductID,
            options: [.appAccountToken(accountToken)]
        )

        XCTAssertEqual(transaction.productID, MeowStoreKitSmokeSupport.monthlyProductID)
        XCTAssertEqual(transaction.appAccountToken, accountToken)

        let beforeFinish = await unfinishedTransaction(id: transaction.id)
        let unfinished = try XCTUnwrap(beforeFinish)
        XCTAssertEqual(unfinished.transaction.appAccountToken, accountToken)
        XCTAssertFalse(unfinished.jwsRepresentation.isEmpty)

        await transaction.finish()

        let afterFinish = await unfinishedTransaction(id: transaction.id)
        XCTAssertNil(afterFinish)
    }

    func testYearlyPurchaseCarriesAccountTokenAndCanFinish() async throws {
        let accountToken = UUID()
        let transaction = try await session.buyProduct(
            identifier: MeowStoreKitSmokeSupport.yearlyProductID,
            options: [.appAccountToken(accountToken)]
        )

        XCTAssertEqual(transaction.productID, MeowStoreKitSmokeSupport.yearlyProductID)
        XCTAssertEqual(transaction.appAccountToken, accountToken)

        let unfinished = try XCTUnwrap(await unfinishedTransaction(id: transaction.id))
        XCTAssertFalse(unfinished.jwsRepresentation.isEmpty)

        await transaction.finish()
        XCTAssertNil(await unfinishedTransaction(id: transaction.id))
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
