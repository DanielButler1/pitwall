// "Remove ads": one payment (£1.99, a non-consumable in Google Play, sold through RevenueCat) that unlocks the
// `no_ads` entitlement for good, on every phone signed in to the same store account. RevenueCat keeps the receipt;
// the app keeps only "this phone is ad-free" in its key-value store, so a paid phone starts without ads before
// RevenueCat has answered, and offline.

import { Platform } from "react-native";
import Purchases, { type CustomerInfo, type PurchasesPackage } from "react-native-purchases";
import { AD_FREE_ENTITLEMENT, REVENUECAT_KEY } from "@/lib/config";
import { kv } from "@/lib/storage";
import { createStore } from "@/lib/store";

const AD_FREE_KEY = "pitwall.adFree";

export type PurchaseState = {
	/** Ads are off on this phone: bought (or restored), as last known. */
	adFree: boolean;
	/** RevenueCat has answered this session, or can't (no key, no connection): ads may decide now. */
	settled: boolean;
	/** Purchases work in this build (a RevenueCat key is set). */
	available: boolean;
	/** The product on sale and its price in the store's currency ("£1.99"), once the store has said. */
	pkg: PurchasesPackage | null;
	price: string | null;
};

const readAdFree = () => {
	try {
		return kv.getItemSync(AD_FREE_KEY) === "yes";
	} catch {
		return false;
	}
};

const apiKey = Platform.OS === "ios" ? REVENUECAT_KEY.ios : Platform.OS === "android" ? REVENUECAT_KEY.android : null;

export const purchaseStore = createStore<PurchaseState>({ adFree: readAdFree(), settled: false, available: Boolean(apiKey), pkg: null, price: null });

const update = (patch: Partial<PurchaseState>) => purchaseStore.set((s) => ({ ...s, ...patch }));

function noteCustomer(info: CustomerInfo) {
	const adFree = AD_FREE_ENTITLEMENT in info.entitlements.active;
	update({ adFree, settled: true });
	void kv.setItem(AD_FREE_KEY, adFree ? "yes" : "no").catch(() => undefined);
	return adFree;
}

let started: Promise<void> | null = null;

/**
 * Connects to RevenueCat once (app/_layout.tsx calls it at startup): who this phone's store account is, whether it
 * has bought ad-free, and the price. Never throws; without a key or a connection, `settled` still turns true and the
 * last known answer stands.
 */
export function startPurchases() {
	started ??= (async () => {
		if (!apiKey) {
			update({ settled: true });
			return;
		}
		try {
			Purchases.configure({ apiKey });
			Purchases.addCustomerInfoUpdateListener(noteCustomer);
			noteCustomer(await Purchases.getCustomerInfo());
		} catch {
			update({ settled: true });
			return;
		}
		void loadOffer();
	})();
	return started;
}

/** The product on sale: the current offering's lifetime package, else its first. */
async function loadOffer() {
	try {
		const offerings = await Purchases.getOfferings();
		const pkg = offerings.current?.lifetime ?? offerings.current?.availablePackages[0] ?? null;
		update({ pkg, price: pkg?.product.priceString ?? null });
		return pkg;
	} catch {
		return null;
	}
}

export type PurchaseOutcome = "bought" | "cancelled" | "pending" | "failed";

/** Opens the store's payment screen for ad-free. */
export async function buyAdFree(): Promise<PurchaseOutcome> {
	await startPurchases();
	const pkg = purchaseStore.get().pkg ?? (await loadOffer());
	if (!pkg) return "failed";
	try {
		const { customerInfo } = await Purchases.purchasePackage(pkg);
		// A slow payment method (cash, some carriers) completes later; the listener picks it up then.
		return noteCustomer(customerInfo) ? "bought" : "pending";
	} catch (error) {
		return (error as { userCancelled?: boolean | null }).userCancelled ? "cancelled" : "failed";
	}
}

/** Asks the store again for this account's purchases (a new phone, a reinstall): true when ad-free is among them. */
export async function restoreAdFree(): Promise<boolean | null> {
	await startPurchases();
	if (!purchaseStore.get().available) return null;
	try {
		return noteCustomer(await Purchases.restorePurchases());
	} catch {
		return null;
	}
}
