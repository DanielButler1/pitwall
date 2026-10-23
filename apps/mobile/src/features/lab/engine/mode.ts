// Universe mode: while a universe is entered, every screen shows it. This keeps the dataset's
// `universeSlot` (what `useDb()` returns) in step with the entered universe, its edits and reality
// refreshing underneath: each of those re-applies it in the background, and the old universe keeps
// showing until the new one is ready.

import type { Db } from "@pitwall/core/f1/dataset";
import { datasetStore, universeSlot } from "@/data/dataset";
import { createStore } from "@/lib/store";
import { applyAsync, universeKey, type ApplyProgress } from "./apply";
import { enteredStore, getUniverse, leaveUniverse, universesStore } from "./store";

export type ModeState =
	| { status: "off" }
	| { status: "building"; id: string; progress: ApplyProgress | null }
	| { status: "ready"; id: string }
	| { status: "error"; id: string; message: string };

export const modeStore = createStore<ModeState>({ status: "off" });

let target: { base: Db; key: string; id: string } | null = null;

function sync() {
	const id = enteredStore.get();
	if (!id) {
		target = null;
		universeSlot.set(null);
		modeStore.set({ status: "off" });
		return;
	}
	const data = datasetStore.get();
	if (data.status !== "ready") return;
	const u = getUniverse(id);
	if (!u) return leaveUniverse();
	const base = data.db;
	const key = universeKey(u);
	const slot = universeSlot.get();
	// a rename: same content, new name
	if (slot && slot.id === id && slot.name !== u.name) universeSlot.set({ ...slot, name: u.name });
	if (target && target.base === base && target.key === key && target.id === id) return;
	const mine = (target = { base, key, id });
	if (slot?.id !== id) universeSlot.set(null);
	modeStore.set({ status: "building", id, progress: null });
	applyAsync(base, key, u.changes, {
		channel: "entered",
		onProgress: (progress) => target === mine && modeStore.set({ status: "building", id, progress }),
	}).then(
		(db) => {
			if (!db || target !== mine) return;
			universeSlot.set({ id, name: getUniverse(id)?.name ?? u.name, base, db });
			modeStore.set({ status: "ready", id });
		},
		(e: Error) => target === mine && modeStore.set({ status: "error", id, message: e.message }),
	);
}

let started = false;

/** Starts following the entered universe (the banner calls it once, from the app's layout). */
export function startUniverseMode() {
	if (started) return;
	started = true;
	enteredStore.subscribe(sync);
	universesStore.subscribe(sync);
	datasetStore.subscribe(sync);
	sync();
}
