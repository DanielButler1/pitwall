// What Settings shows and does about the saved dataset: when the app last asked the site for new
// data, and starting again from a fresh download.

import { File, Paths } from "expo-file-system";
import { datasetStore, retryDataset } from "@/data/dataset";
import { kv } from "@/lib/storage";
import { createStore } from "@/lib/store";

const CHECKED_KEY = "pitwall.dataset.checkedAt";
/** The ETag key src/data/dataset.ts keeps beside the saved copy. */
const ETAG_KEY = "pitwall.dataset.etag";

const readChecked = () => {
	try {
		const v = Number(kv.getItemSync(CHECKED_KEY));
		return Number.isFinite(v) && v > 0 ? v : null;
	} catch {
		return null;
	}
};

/** When a check for new data last finished (ms), on this device. */
export const lastCheckedStore = createStore<number | null>(readChecked());

// A check is over when the dataset stops "checking" (whether or not it found anything new).
let wasChecking = (() => {
	const s = datasetStore.get();
	return s.status === "ready" && s.checking;
})();
let watching = false;

/** Starts noting when checks finish. Called by Home (always mounted) and Settings; idempotent. */
export function watchDataChecks() {
	if (watching) return;
	watching = true;
	datasetStore.subscribe(() => {
		const s = datasetStore.get();
		const checking = s.status === "ready" && s.checking;
		if (wasChecking && !checking && s.status === "ready") {
			const now = Date.now();
			lastCheckedStore.set(now);
			void kv.setItem(CHECKED_KEY, String(now)).catch(() => undefined);
		}
		wasChecking = checking;
	});
}

/** Deletes the saved copy and downloads the dataset again, as on first launch. */
export async function downloadAgain() {
	try {
		const saved = new File(Paths.document, "f1.json");
		if (saved.exists) saved.delete();
	} catch {
		// nothing saved, or already gone
	}
	await kv.removeItem(ETAG_KEY).catch(() => undefined);
	retryDataset();
}
