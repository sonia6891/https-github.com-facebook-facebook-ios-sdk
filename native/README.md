# Native mobile shell

This directory is the native App Store / Google Play path for 「喵的，又要上班了」.

## Current target

- Capacitor 8.5.2
- iOS first
- Bundle ID (provisional): `com.lumilab.meowwork`
- Pro product IDs:
  - `meowwork.pro.monthly`
  - `meowwork.pro.yearly`
- Taiwan target prices:
  - NT$99 / month
  - NT$790 / year
- Eligible first-time subscribers: 3-day free trial

## Build web assets

```bash
cd native
npm install
npm run sync:web
```

## Create iOS project

```bash
npx cap add ios
```

The repository CI bootstrap copies the StoreKit 2 Swift sources into the generated Xcode app and registers `MeowStoreBilling`.

## Important

The web preview never performs real payment. Real Pro purchases must be presented by StoreKit on iOS and Google Play Billing on Android. Supabase remains the server-side entitlement source after store verification.
