// Share links in the website's format (packages/core/src/universe/share.ts):
//
//   https://pitwall.phaseo.app/share#1.<base64url(deflate-raw(JSON))>
//
// Core compresses with CompressionStream, which Hermes doesn't have; fflate produces the same
// raw-DEFLATE format synchronously, so links made here open on the website and the other way round.
// Validation is core's own: the inflated JSON goes through `decodeUniverse` as an uncompressed
// ("0.") link. No React Native imports, so it can be tested in node.

import { deflateSync, inflateSync, strToU8 } from "fflate";
import { decodeUniverse, fromBase64Url, toBase64Url, type SharedUniverse } from "@pitwall/core/universe/share";

/** Same limit as the website: a link can't unpack to more than this. */
const MAX_JSON = 4_000_000;
const DAMAGED = "This share link is damaged (was it cut off?)";

/** The part after `#`, from a whole link or the fragment itself. */
export function shareFragment(link: string): string {
	const s = link.trim();
	const hash = s.indexOf("#");
	return hash >= 0 ? s.slice(hash + 1) : s;
}

export function encodeShare(u: SharedUniverse): string {
	// the same payload, key order included, as core's encodeUniverse
	const payload: Record<string, unknown> = { v: 1, n: u.name, c: u.changes.map(({ id: _id, ...rest }) => (void _id, rest)) };
	if (u.description) payload.d = u.description;
	return "1." + toBase64Url(deflateSync(strToU8(JSON.stringify(payload)), { level: 9, mem: 12 }));
}

export async function decodeShare(link: string): Promise<SharedUniverse> {
	const s = shareFragment(link);
	const dot = s.indexOf(".");
	if (dot < 0 || s.slice(0, dot) !== "1") return decodeUniverse(s);
	let json: Uint8Array;
	try {
		json = inflateSync(fromBase64Url(s.slice(dot + 1)));
	} catch {
		throw new Error(DAMAGED);
	}
	if (json.length > MAX_JSON) throw new Error("Share link is too large");
	// checks the JSON exactly as the website does
	return decodeUniverse("0." + toBase64Url(json));
}
