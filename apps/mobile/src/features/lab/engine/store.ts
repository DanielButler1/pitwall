// The Lab's universes, kept on the device (the website keeps them in IndexedDB; here they sit in
// the app's SQLite key-value store). A universe is only a name and a list of changes, a few KB, so
// the whole list is one JSON value, read synchronously at startup.

import type { Change, Universe } from "@pitwall/core/universe/apply";
import { changesHash, sharedId, type SharedUniverse } from "@pitwall/core/universe/share";
import { kv } from "@/lib/storage";
import { createStore } from "@/lib/store";

/** A universe opened from someone's share link, kept apart until the user saves or edits it. */
export type StoredUniverse = Universe & { shared?: boolean };

const KEY = "pitwall.lab.universes";
const ENTERED_KEY = "pitwall.lab.entered";

function read(): StoredUniverse[] {
	try {
		const parsed = JSON.parse(kv.getItemSync(KEY) ?? "[]");
		return Array.isArray(parsed) ? parsed.filter((u) => u && typeof u.id === "string" && Array.isArray(u.changes)) : [];
	} catch {
		return [];
	}
}

const sorted = (list: StoredUniverse[]) => [...list].sort((a, b) => b.updatedAt - a.updatedAt);

export const universesStore = createStore<StoredUniverse[]>(sorted(read()));

function write(list: StoredUniverse[]) {
	universesStore.set(sorted(list));
	void kv.setItem(KEY, JSON.stringify(universesStore.get()));
}

/** Short random id (the website uses 8 characters of a UUID; Hermes has no crypto.randomUUID). */
export const newId = () => Math.random().toString(36).slice(2, 10).padEnd(8, "0");

export const getUniverse = (id: string) => universesStore.get().find((u) => u.id === id);
export const useUniverses = () => universesStore.use();
export const useUniverse = (id: string | undefined) => universesStore.use((list) => list.find((u) => u.id === id) ?? null);

export function saveUniverse<U extends StoredUniverse>(u: U): U {
	const next = { ...u, updatedAt: Date.now() };
	write([...universesStore.get().filter((x) => x.id !== u.id), next]);
	return next;
}

/** Edits make a shared universe the user's own (as on the website). */
export function editUniverse(id: string, patch: Partial<Universe>): StoredUniverse | null {
	const u = getUniverse(id);
	if (!u) return null;
	const { shared: _shared, ...own } = u;
	void _shared;
	return saveUniverse({ ...own, ...patch });
}

export function createUniverse(name: string, changes: Change[] = [], description?: string): StoredUniverse {
	const now = Date.now();
	return saveUniverse({ id: newId(), name, createdAt: now, updatedAt: now, changes, ...(description ? { description } : {}) });
}

export function duplicateUniverse(id: string): StoredUniverse | null {
	const u = getUniverse(id);
	return u ? createUniverse(`${u.name} (copy)`, u.changes.map((c) => ({ ...c, id: newId() })), u.description) : null;
}

export function deleteUniverse(id: string) {
	write(universesStore.get().filter((u) => u.id !== id));
	if (enteredStore.get() === id) leaveUniverse();
}

/** The same JSON as the website's "Copy JSON". */
export function exportUniverse(u: Universe): string {
	return JSON.stringify({ pitwall: 1, name: u.name, description: u.description, changes: u.changes });
}

export function importUniverse(json: string): StoredUniverse {
	let parsed: { name?: unknown; description?: unknown; changes?: unknown };
	try {
		parsed = JSON.parse(json);
	} catch {
		throw new Error("That isn’t a Pitwall universe (it isn’t JSON)");
	}
	if (!Array.isArray(parsed?.changes)) throw new Error("That isn’t a Pitwall universe");
	return createUniverse(String(parsed.name ?? "Imported universe"), parsed.changes as Change[], typeof parsed.description === "string" ? parsed.description : undefined);
}

/* ---------------------------------------------------------------- shared --- */

/**
 * Keeps a universe from a share link and returns the id to open, exactly as the website does: a
 * universe of the user's own with the same changes is reused; otherwise a `shared` copy is stored
 * under an id derived from the content, so opening the same link twice never duplicates it.
 */
export function openShared(shared: SharedUniverse): { id: string; existing: StoredUniverse | null } {
	const hash = changesHash(shared.changes);
	const own = universesStore.get().find((u) => !u.shared && changesHash(u.changes) === hash);
	if (own) return { id: own.id, existing: own };
	const first = sharedId(shared);
	for (let n = 1, id = first; ; id = `${first}-${++n}`) {
		const u = getUniverse(id);
		if (u?.shared) return { id, existing: null };
		if (u) continue;
		const now = Date.now();
		saveUniverse({ id, name: shared.name, description: shared.description, createdAt: now, updatedAt: now, changes: shared.changes, shared: true });
		return { id, existing: null };
	}
}

/** "Save to my Lab": the shared copy becomes an ordinary universe (same id and version, so nothing re-applies). */
export function keepShared(id: string) {
	const u = getUniverse(id);
	if (!u) return;
	const { shared: _shared, ...kept } = u;
	void _shared;
	write([...universesStore.get().filter((x) => x.id !== id), kept]);
}

/* --------------------------------------------------------------- entered --- */

/** The universe the whole app is showing (null: reality). Remembered across restarts. */
export const enteredStore = createStore<string | null>(kv.getItemSync(ENTERED_KEY) || null);

export function enterUniverse(id: string) {
	enteredStore.set(id);
	void kv.setItem(ENTERED_KEY, id);
}

export function leaveUniverse() {
	enteredStore.set(null);
	void kv.removeItem(ENTERED_KEY);
}
