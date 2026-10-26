// Ads: Google AdMob native ads, drawn by the app as one of its own rows (NativeAdSlot), at most one per screen and
// never in the games, the Lab, search or settings. A phone that has bought ad-free never loads the ads SDK or sees the
// consent form. Everyone else gets Google's consent form first where the law asks for one (UK, EEA, Switzerland,
// some US states): the one system surface besides the share sheet and the store's payment screen.

import mobileAds, { AdsConsent, AdsConsentPrivacyOptionsRequirementStatus, TestIds } from "react-native-google-mobile-ads";
import { ADMOB_NATIVE_UNIT } from "@/lib/config";
import { createStore } from "@/lib/store";
import { purchaseStore, startPurchases } from "./purchases";

/** The native ad unit: the real one when set, Google's test unit in development builds, else none (no ads). */
export const NATIVE_UNIT = ADMOB_NATIVE_UNIT ?? (__DEV__ ? TestIds.NATIVE : null);

export type AdsState = {
	/** Consent is settled and the SDK is up: slots may load ads. */
	ready: boolean;
	/** The law gives this user a way back to the consent form (Settings → Ad privacy choices). */
	privacyOptions: boolean;
};

export const adsStore = createStore<AdsState>({ ready: false, privacyOptions: false });

let started: Promise<void> | null = null;

/**
 * Starts ads once the dataset is open (app/_layout.tsx): waits for RevenueCat's answer, then (if not ad-free) asks
 * for consent where needed and starts the SDK. Never throws; any failure just means no ads this session.
 */
export function startAds() {
	started ??= (async () => {
		if (!NATIVE_UNIT) return;
		await startPurchases();
		if (purchaseStore.get().adFree) return;
		try {
			const info = await AdsConsent.gatherConsent();
			adsStore.set({ ready: false, privacyOptions: info.privacyOptionsRequirementStatus === AdsConsentPrivacyOptionsRequirementStatus.REQUIRED });
			if (!info.canRequestAds || purchaseStore.get().adFree) return;
			await mobileAds().initialize();
			adsStore.set((s) => ({ ...s, ready: true }));
		} catch {
			// No connection, or the consent service failed: try again next launch.
		}
	})();
	return started;
}

// Buying ad-free takes the ads away at once, on every screen.
purchaseStore.subscribe(() => {
	if (purchaseStore.get().adFree && adsStore.get().ready) adsStore.set((s) => ({ ...s, ready: false }));
});

/** Google's form for changing ad consent (Settings → Ad privacy choices). */
export async function showAdPrivacyOptions() {
	try {
		const info = await AdsConsent.showPrivacyOptionsForm();
		if (info.canRequestAds && !adsStore.get().ready && !purchaseStore.get().adFree) {
			await mobileAds().initialize();
			adsStore.set((s) => ({ ...s, ready: true }));
		}
	} catch {
		// The form couldn't load (offline): nothing changed.
	}
}
