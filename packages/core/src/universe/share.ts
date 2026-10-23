// Share links. A universe is only a name, a description and a change list, so
// the whole thing fits in a URL:
//
//   /share#1.<base64url(deflate-raw(JSON))>      (0.<base64url(JSON)> where CompressionStream is missing)
//
// The data sits in the fragment, so it never reaches the server and works on
// static hosting. Opening the link (src/app/share/page.tsx) stores the universe
// in IndexedDB under an id derived from its content (`s-<hash>`), flagged
// `shared`, and redirects to /u/<id>: every universe page, link and reload then
// works exactly as for one made locally, and re-opening the same link reuses the
// same copy. "Save to my Lab" turns it into an ordinary universe.
//
// Pure (no IndexedDB) so it can be tested in node.

import type { Change, ChangeKind } from "./apply.ts";
import { CUSTOM_SYSTEM, sanitizePointsSystem } from "../f1/points.ts";

export type SharedUniverse = { name: string; description?: string; changes: Change[] };

const KINDS: Record<ChangeKind, true> = {
	points: true,
	"race-sim": true,
	"season-sim": true,
	"race-edit": true,
	"remove-driver": true,
	"history-sim": true,
	"driver-performance": true,
	"team-performance": true,
	"driver-swap": true,
	"driver-move": true,
	career: true,
};

/** Links longer than this may be cut off by some chat apps and email clients. */
export const LONG_LINK = 4000;
const MAX_JSON = 4_000_000;

/* ------------------------------------------------------------- base64url --- */

export function toBase64Url(bytes: Uint8Array): string {
	let bin = "";
	for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
	return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromBase64Url(s: string): Uint8Array {
	const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
	const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
	const out = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
	return out;
}

/* ----------------------------------------------------------- compression --- */

const canCompress = () => typeof CompressionStream !== "undefined" && typeof DecompressionStream !== "undefined";

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream, limit = Infinity): Promise<Uint8Array> {
	const reader = new Blob([bytes as BlobPart]).stream().pipeThrough(stream).getReader();
	const chunks: Uint8Array[] = [];
	let size = 0;
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		size += value.length;
		if (size > limit) {
			await reader.cancel();
			throw new Error("Share link is too large");
		}
		chunks.push(value);
	}
	const out = new Uint8Array(size);
	let at = 0;
	for (const c of chunks) out.set(c, at), (at += c.length);
	return out;
}

/* ---------------------------------------------------------------- encode --- */

/** Change ids only matter inside one Lab, so links leave them out and decoding renumbers them. */
const stripIds = (changes: Change[]) => changes.map(({ id: _id, ...rest }) => (void _id, rest));

export async function encodeUniverse(u: SharedUniverse): Promise<string> {
	const payload: Record<string, unknown> = { v: 1, n: u.name, c: stripIds(u.changes) };
	if (u.description) payload.d = u.description;
	const json = new TextEncoder().encode(JSON.stringify(payload));
	if (!canCompress()) return "0." + toBase64Url(json);
	return "1." + toBase64Url(await pipe(json, new CompressionStream("deflate-raw")));
}

export async function decodeUniverse(data: string): Promise<SharedUniverse> {
	const s = data.trim().replace(/^#/, "");
	const dot = s.indexOf(".");
	const version = s.slice(0, dot);
	if (dot < 0 || (version !== "0" && version !== "1")) throw new Error("Not a Pitwall share link");
	let bytes: Uint8Array;
	try {
		bytes = fromBase64Url(s.slice(dot + 1));
	} catch {
		throw new Error("This share link is damaged (was it cut off?)");
	}
	if (version === "1") {
		if (!canCompress()) throw new Error("This browser can't open compressed share links");
		try {
			bytes = await pipe(bytes, new DecompressionStream("deflate-raw"), MAX_JSON);
		} catch (e) {
			throw new Error((e as Error).message === "Share link is too large" ? "Share link is too large" : "This share link is damaged (was it cut off?)");
		}
	}
	let parsed: { v?: unknown; n?: unknown; d?: unknown; c?: unknown };
	try {
		parsed = JSON.parse(new TextDecoder().decode(bytes));
	} catch {
		throw new Error("This share link is damaged (was it cut off?)");
	}
	return validate(parsed);
}

function validate(p: { v?: unknown; n?: unknown; d?: unknown; c?: unknown }): SharedUniverse {
	if (p?.v !== 1 || !Array.isArray(p.c)) throw new Error("Not a Pitwall share link");
	const changes = p.c.map((c, i) => {
		if (!c || typeof c !== "object" || !(KINDS as Record<string, true | undefined>)[(c as { kind?: string }).kind ?? ""])
			throw new Error("This share link contains a change this version of Pitwall doesn't understand");
		const change = { ...(c as object), id: `s${i + 1}` } as Change;
		return change.kind === "points" ? pointsChange(change) : change;
	});
	const name = typeof p.n === "string" && p.n.trim() ? p.n.trim().slice(0, 200) : "Shared universe";
	const description = typeof p.d === "string" && p.d.trim() ? p.d.trim().slice(0, 2000) : undefined;
	return description ? { name, description, changes } : { name, changes };
}

/** A points change with its years checked and any custom system sanitised. */
function pointsChange(c: Extract<Change, { kind: "points" }>): Change {
	const year = (y: unknown) => Number.isInteger(y);
	if (!year(c.fromYear) || !year(c.toYear) || typeof c.system !== "string") throw new Error("This share link is damaged (was it cut off?)");
	const { id, fromYear, toYear } = c;
	if (c.custom === undefined) return { id, kind: "points", fromYear, toYear, system: c.system };
	const custom = sanitizePointsSystem(c.custom);
	if (!custom) throw new Error("This share link contains a points system Pitwall can't read");
	return { id, kind: "points", fromYear, toYear, system: CUSTOM_SYSTEM, custom };
}

/** Full link for a universe, e.g. https://example.com/share#1.xyz */
export async function shareUrl(origin: string, u: SharedUniverse): Promise<string> {
	return `${origin}/share#${await encodeUniverse(u)}`;
}

/* ------------------------------------------------------------------ hash --- */

// Key order inside a change doesn't matter for identity.
const canonical = (v: unknown): unknown =>
	Array.isArray(v)
		? v.map(canonical)
		: v && typeof v === "object"
			? Object.fromEntries(
					Object.keys(v)
						.sort()
						.map((k) => [k, canonical((v as Record<string, unknown>)[k])]),
				)
			: v;

function hashString(s: string): string {
	let a = 0x811c9dc5;
	let b = 0x9e3779b9;
	for (let i = 0; i < s.length; i++) {
		const c = s.charCodeAt(i);
		a = Math.imul(a ^ c, 0x01000193);
		b = Math.imul(b ^ c, 0x5bd1e995);
		b ^= b >>> 15;
	}
	return (a >>> 0).toString(36).padStart(7, "0") + (b >>> 0).toString(36).padStart(7, "0");
}

/** Content hash of a change list (ids and key order ignored): two universes with the same hash play out identically. */
export const changesHash = (changes: Change[]) => hashString(JSON.stringify(canonical(stripIds(changes))));

/** Deterministic id for a shared universe's local copy: same link, same id. */
export const sharedId = (u: SharedUniverse) => `s-${hashString(JSON.stringify([u.name, canonical(stripIds(u.changes))])).slice(0, 12)}`;
