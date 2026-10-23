// Real history on the device: the website's dataset (/data/f1.json, ~5 MB, ~0.8 MB gzipped)
// downloaded once, kept in the app's documents, and indexed with the same @pitwall/core code the
// website runs. Every screen is built from it, so the app works offline after the first launch.
//
// Each launch opens the saved copy straight away, then asks the site whether there's a newer one
// (If-None-Match on the file's ETag): after a race weekend that brings in the new results.

import { File, Paths } from "expo-file-system";
import { useMemo } from "react";
import { hydrate, indexData, type Db, type RawDataset } from "@pitwall/core/f1/dataset";
import { dataUrl } from "@/lib/config";
import { kv } from "@/lib/storage";
import { createStore } from "@/lib/store";

const file = () => new File(Paths.document, "f1.json");
const ETAG_KEY = "pitwall.dataset.etag";

export type DatasetState =
	| { status: "loading" }
	/** First launch: nothing saved yet, fetching the dataset. */
	| { status: "downloading" }
	| { status: "ready"; db: Db; generatedAt: string; checking: boolean }
	| { status: "error"; message: string };

export const datasetStore = createStore<DatasetState>({ status: "loading" });

const open = (text: string): Db => indexData(hydrate(JSON.parse(text) as RawDataset));

function ready(db: Db, checking: boolean) {
	datasetStore.set({ status: "ready", db, generatedAt: db.meta.generatedAt, checking });
}

/**
 * Fetches the dataset if the site has a newer one than `etag` (null: always). Returns its text and
 * ETag, or null when the saved copy is current.
 */
async function download(etag: string | null): Promise<{ text: string; etag: string | null } | null> {
	const res = await fetch(dataUrl("f1.json"), { headers: etag ? { "If-None-Match": etag } : {} });
	if (res.status === 304) return null;
	if (!res.ok) throw new Error(`The site answered ${res.status}`);
	return { text: await res.text(), etag: res.headers.get("etag") };
}

async function save(text: string, etag: string | null) {
	await file().write(text);
	if (etag) await kv.setItem(ETAG_KEY, etag);
}

let started = false;

/** Opens the saved dataset (or downloads it on first launch), then checks for a newer one. Runs once. */
export async function bootDataset() {
	if (started) return;
	started = true;
	const saved = file();
	let etag: string | null = null;
	if (saved.exists) {
		try {
			ready(open(await saved.text()), true);
			etag = await kv.getItem(ETAG_KEY);
		} catch {
			// a damaged copy: start again from the site
			saved.delete();
		}
	}
	if (datasetStore.get().status !== "ready") {
		datasetStore.set({ status: "downloading" });
		try {
			const got = (await download(null))!;
			const db = open(got.text);
			ready(db, false);
			await save(got.text, got.etag);
		} catch (e) {
			datasetStore.set({ status: "error", message: e instanceof Error ? e.message : String(e) });
		}
		return;
	}
	await refreshDataset(etag);
}

/** Swaps in a newer dataset when the site has one; quietly keeps the saved one when offline. */
export async function refreshDataset(etag?: string | null) {
	const current = datasetStore.get();
	if (current.status !== "ready") return;
	datasetStore.set({ ...current, checking: true });
	try {
		const got = await download(etag === undefined ? await kv.getItem(ETAG_KEY) : etag);
		if (got) {
			const db = open(got.text);
			ready(db, false);
			await save(got.text, got.etag);
			return;
		}
	} catch {
		// offline or the site is down: the saved copy stays
	}
	const now = datasetStore.get();
	if (now.status === "ready") datasetStore.set({ ...now, checking: false });
}

/** Retries after a failed first download. */
export function retryDataset() {
	started = false;
	datasetStore.set({ status: "loading" });
	void bootDataset();
}

/** The dataset. Screens render inside the root gate (app/_layout.tsx), so it's always there. */
export function useDb(): Db {
	const state = datasetStore.use();
	if (state.status !== "ready") throw new Error("The dataset isn't loaded yet");
	return state.db;
}

/**
 * A view built from the dataset, rebuilt only when the dataset or `deps` change: the app's
 * equivalent of the website's server-side `view(getDb(), ...)`.
 */
export function useView<T>(build: (db: Db) => T, deps: readonly unknown[]): T {
	const db = useDb();
	// the caller's deps are the point: this is useMemo keyed on the dataset plus them
	// eslint-disable-next-line react-hooks/exhaustive-deps, react-hooks/use-memo
	return useMemo(() => build(db), [db, ...deps]);
}
