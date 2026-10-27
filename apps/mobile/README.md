# Pitwall mobile

The Pitwall app for Android (iOS-ready): every section of the website, built for a phone. Expo SDK 58, React Native 0.88, expo-router, Uniwind (Tailwind for React Native).

## How it works

- **The data is the website's.** On first launch the app downloads the dataset the website serves (`/data/f1.json`, about 1 MB compressed), keeps it in the app's documents, and from then on opens it straight away and works offline. Each launch (and each return to the foreground) asks the site for a newer one by ETag, so new results arrive after a race weekend. See `src/data/dataset.ts`.
- **Every screen is built on the device** with `@pitwall/core` (`packages/core`), the same code the website runs: `useView((db) => driverView(db, id), [id])`. There is no app-specific API. Only lap charts, pit stops and two game files are fetched on demand.
- **Lab universes** are stored on the device; entering one makes the whole app show it (`useDb()` returns the universe's dataset), with a banner to leave it. Share links are compatible with the website's.
- **Daily games** always use real history and keep their saves in the app's SQLite store (`setGameStorage` in core).

## Layout

```
app/                         routes (one-line files re-exporting a screen)
  (app)/_layout.tsx          tabs: a bottom bar on phones, a sidebar from 720 dp
  (app)/(home,browse,records,play,lab)/
                             every screen, in every tab's stack: a driver opens on top of
                             the tab you're in. Paths match the website's URLs.
  search.tsx, settings.tsx   outside the tabs
  +native-intent.tsx         pitwall.phaseo.app and pitwall:// links → app routes
src/components/ui            the design system's primitives (from Phaseo mobile)
src/components/f1.tsx        Pitwall's: flags, position badges, stat tiles, page shells
src/components/charts.tsx    hold-to-read SVG charts (from Solar)
src/features/<area>/         screens and their parts: home, browse, people, places,
                             seasons, records, play (kit/ + games), lab, search, settings,
                             ads (native ads, consent, Remove ads)
src/data/dataset.ts          the dataset on the device, useDb/useView, universe mode
src/lib/                     links (website-style paths, useOpen), format, haptics,
                             storage, store, config
modules/haptics              Android touch pulses for motors that can't play system effects
```

## Design rules

Shared with Phaseo and Solar: sentence-case bold headings, flat rows and dividers rather than cards, `rounded-md`, borders not shadows, Montserrat, tokens from `global.css` (mirroring the website's theme: F1 red, podium and universe colours). Wide web tables become rows with the few numbers that matter; detail goes one tap deeper. Haptics mark choices, switches, scrubs and outcomes, never plain taps (`haptic(kind)` in `src/lib/haptics.ts`). No system dialogs or toasts: ask with `confirm()`, tell with `alert()` and report outcomes with `toast()` from `@/components/ui` (drawn by `FeedbackHost` in the app's design). Spinners are the kit's `Spinner`, sheets its `Sheet`, and there's no pull-to-refresh (its spinner is the system's; the app checks for new data on launch and on return, and says so with a toast). The share sheet is the one system surface, for sending to other apps, besides Google's ad consent form and the store's payment screen (below).

## Ads and Remove ads

No banners or interstitials. `NativeAdSlot` (`src/features/ads`) draws an AdMob native ad as one of the app's rows, with an "Ad" badge and a "Remove ads" link under it, and draws nothing until one has loaded. One per screen at most: Home (after the latest race), driver, team, circuit, race and season pages, never in the games, the Lab, search or Settings. A one-off purchase through RevenueCat (`purchases.ts`) unlocks the `no_ads` entitlement for good; a paid phone never loads the ads SDK or sees the consent form. Everyone else gets Google's consent form (UMP) first where the law requires one, and Settings → Ads has "Ad privacy choices" for them.

The IDs live in `app.json`; none of them is secret:

- `plugins` → `react-native-google-mobile-ads` → `androidAppId` / `iosAppId`: the AdMob app IDs. They're Google's sample IDs now; replace them with the app's own, then `pnpm apk --clean`.
- `extra.admobNativeUnit` (or `EXPO_PUBLIC_ADMOB_NATIVE_UNIT`): the native ad unit. Unset, development builds show Google's test ads and release builds show none.
- `extra.revenueCatAndroidKey` / `revenueCatIosKey` (or `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY` / `_IOS_KEY`): RevenueCat's public SDK keys. Unset, "Remove ads" isn't offered. RevenueCat's Test Store key works in a development build before the app is on Google Play.

In RevenueCat: a non-consumable product (£1.99 in Google Play), an entitlement `no_ads` attached to it, and a current offering with it as the Lifetime package. The price shown comes from the store.

## Running it

From `apps/mobile`. It needs a development build (native modules), not Expo Go.

```bash
pnpm apk --debug        # build and install the development build (first time ~15 min)
pnpm dev                # Metro; the development build loads the app from it
pnpm apk                # a standalone release APK (pitwall.apk), installed over Wi-Fi
pnpm run deploy         # install pitwall.apk on phones on wireless debugging
pnpm typecheck
pnpm lint
```

`pnpm apk --clean` regenerates `android/` (after changing `app.json`, plugins or native dependencies); `android/` and `ios/` are generated and not committed. The APK is signed with the debug key: fine for your own phone, not for the Play Store.

`EXPO_PUBLIC_PITWALL_ORIGIN` points the app at another copy of the website (e.g. a dev server on the local network) for its data.

**Windows:** native builds can loop with `ninja: error: manifest 'build.ninja' still dirty after 100 tries` with the SDK's default CMake 3.22; the build script points Gradle at CMake 3.31 when it's installed (Android Studio, SDK Manager, CMake).
