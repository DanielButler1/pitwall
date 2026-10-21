"use client";

// Universes live in the browser (IndexedDB). They are just change lists, so
// they are tiny and can be exported/imported as JSON.

import { openDB, type IDBPDatabase } from "idb";
import type { Change, Universe } from "./apply";
import { changesHash, sharedId, type SharedUniverse } from "./share";

/** A universe opened from someone's share link, kept apart until the user saves it. */
export type StoredUniverse = Universe & { shared?: boolean };
export const isShared = (u: Universe | null | undefined) => !!(u as StoredUniverse | null | undefined)?.shared;

let dbPromise: Promise<IDBPDatabase> | null = null;
const db = () =>
	(dbPromise ??= openDB("pitwall", 1, {
		upgrade(d) {
			d.createObjectStore("universes", { keyPath: "id" });
		},
	}));

const listeners = new Set<() => void>();
export const onUniversesChanged = (fn: () => void) => {
	listeners.add(fn);
	return () => {
		listeners.delete(fn);
	};
};
const notify = () => listeners.forEach((fn) => fn());

export const newId = () => crypto.randomUUID().slice(0, 8);

export async function listUniverses(): Promise<StoredUniverse[]> {
	const all = (await (await db()).getAll("universes")) as StoredUniverse[];
	return all.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getUniverse(id: string): Promise<StoredUniverse | undefined> {
	return (await (await db()).get("universes", id)) as StoredUniverse | undefined;
}

export async function saveUniverse<U extends StoredUniverse>(u: U): Promise<U> {
	const next = { ...u, updatedAt: Date.now() };
	await (await db()).put("universes", next);
	notify();
	return next;
}

export async function createUniverse(name: string, changes: Change[] = [], description?: string): Promise<Universe> {
	const now = Date.now();
	return saveUniverse({ id: newId(), name, createdAt: now, updatedAt: now, changes, ...(description ? { description } : {}) });
}

export async function deleteUniverse(id: string) {
	await (await db()).delete("universes", id);
	notify();
}

export function exportUniverse(u: Universe): string {
	return JSON.stringify({ pitwall: 1, name: u.name, description: u.description, changes: u.changes });
}

export async function importUniverse(json: string): Promise<Universe> {
	const parsed = JSON.parse(json);
	if (!Array.isArray(parsed?.changes)) throw new Error("Not a Pitwall universe");
	return createUniverse(String(parsed.name ?? "Imported universe"), parsed.changes, typeof parsed.description === "string" ? parsed.description : undefined);
}

/* ---------------------------------------------------------------- shared --- */

/**
 * Store a universe from a share link and return the id to open. If the user
 * already has a universe with exactly these changes, that one is reused;
 * otherwise a read-only `shared` copy is kept under an id derived from the
 * content, so opening the same link again never duplicates it.
 */
export async function openShared(shared: SharedUniverse): Promise<{ id: string; existing: StoredUniverse | null }> {
	const hash = changesHash(shared.changes);
	const own = (await listUniverses()).find((u) => !u.shared && changesHash(u.changes) === hash);
	if (own) return { id: own.id, existing: own };
	const first = sharedId(shared);
	// a saved copy of this link may have been edited since: then it gets a sibling id
	for (let n = 1, id = first; ; id = `${first}-${++n}`) {
		const u = await getUniverse(id);
		if (u?.shared) return { id, existing: null };
		if (u) continue;
		const now = Date.now();
		await saveUniverse({ id, name: shared.name, description: shared.description, createdAt: now, updatedAt: now, changes: shared.changes, shared: true });
		return { id, existing: null };
	}
}

/** "Save to my Lab": the shared copy becomes an ordinary, editable universe (same id and version, so nothing is re-applied). */
export async function keepShared(u: Universe): Promise<Universe> {
	const { shared: _shared, ...kept } = u as StoredUniverse;
	void _shared;
	await (await db()).put("universes", kept);
	notify();
	return kept;
}
