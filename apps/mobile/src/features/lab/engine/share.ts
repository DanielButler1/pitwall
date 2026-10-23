// Sharing universes as website links, and opening the links people send.

import { Share } from "react-native";
import type { Universe } from "@pitwall/core/universe/apply";
import { LONG_LINK } from "@pitwall/core/universe/share";
import { webUrl } from "@/lib/config";
import { decodeShare, encodeShare } from "./codec";
import { openShared, type StoredUniverse } from "./store";

/** The universe as a link anyone can open on the website or in the app: https://pitwall.phaseo.app/share#1.… */
export const shareLink = (u: Pick<Universe, "name" | "description" | "changes">) => webUrl(`/share#${encodeShare(u)}`);

/** Opens the system share sheet with the universe's link. Resolves with the link (and whether it's long). */
export async function shareUniverse(u: Pick<Universe, "name" | "description" | "changes">) {
	const url = shareLink(u);
	await Share.share({ message: url, title: u.name });
	return { url, long: url.length > LONG_LINK };
}

/**
 * Unpacks a share link (a whole `https://pitwall.phaseo.app/share#…` URL, or just what follows the
 * `#`) into the Lab and returns the universe to open: `/lab/<id>` shows it. A universe of the
 * user's own with the same changes is reused (`existing`); otherwise it's kept under "Shared with
 * you", and opening the same link again finds the same copy. Throws a readable error for a
 * damaged or foreign link.
 */
export async function openSharedUniverse(link: string): Promise<{ id: string; existing: StoredUniverse | null }> {
	return openShared(await decodeShare(link));
}
