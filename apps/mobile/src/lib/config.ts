import Constants from "expo-constants";

/**
 * The website the app takes its data from: EXPO_PUBLIC_PITWALL_ORIGIN (e.g. a dev server on the
 * local network), then app.json's extra.pitwallOrigin, then the live site.
 */
export const ORIGIN = (process.env.EXPO_PUBLIC_PITWALL_ORIGIN ?? (Constants.expoConfig?.extra?.pitwallOrigin as string | undefined) ?? "https://pitwall.phaseo.app").replace(/\/$/, "");

/** A file under the website's /data (the dataset, lap charts, game files). */
export const dataUrl = (path: string) => `${ORIGIN}/data/${path.replace(/^\//, "")}`;

/** The same page on the website, for sharing. */
export const webUrl = (path: string) => `${ORIGIN}${path.startsWith("/") ? path : `/${path}`}`;

const extra = (key: string) => (Constants.expoConfig?.extra?.[key] as string | null | undefined) || null;

/**
 * The AdMob native ad unit (EXPO_PUBLIC_ADMOB_NATIVE_UNIT, then app.json's extra.admobNativeUnit). Without one, a
 * development build shows Google's test ads and a release build shows none.
 */
export const ADMOB_NATIVE_UNIT = process.env.EXPO_PUBLIC_ADMOB_NATIVE_UNIT || extra("admobNativeUnit");

/**
 * RevenueCat's public SDK key for this platform (EXPO_PUBLIC_REVENUECAT_ANDROID_KEY / _IOS_KEY, then app.json's
 * extra.revenueCatAndroidKey / revenueCatIosKey). Public by design: it ships inside the app. Without one, "Remove ads"
 * says it isn't available yet.
 */
export const REVENUECAT_KEY = {
	android: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY || extra("revenueCatAndroidKey"),
	ios: process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY || extra("revenueCatIosKey"),
};

/** The RevenueCat entitlement that turns ads off (the £1.99 one-off purchase unlocks it). */
export const AD_FREE_ENTITLEMENT = "no_ads";
