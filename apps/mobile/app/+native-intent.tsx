// Website links open in the app: https://pitwall.phaseo.app/<path> and pitwall://<path> become the
// same screen here (paths mirror the website's). Universes live in the Lab tab.

import { datasetStore } from "@/data/dataset";
import { isRandomKind, randomPath } from "@/features/home/random";

const WEB_HOSTS = new Set(["pitwall.phaseo.app", "www.pitwall.phaseo.app"]);

/** A website path (with its query and the part after `#`) as an app path. */
function appPath(path: string, query: string, fragment: string): string {
	const clean = path.replace(/\/+$/, "") || "/";
	// a shared universe travels in the fragment; the Lab's share screen unpacks it
	if (clean === "/share") return fragment ? `/lab/share?d=${encodeURIComponent(fragment)}` : "/lab";
	// /u/<id>/...: a universe saved in a browser. Its id only means something if it's saved here too,
	// so the Lab's page for it says either way rather than entering it blindly.
	const universe = clean.match(/^\/u\/([^/]+)/);
	if (universe) return `/lab/${universe[1]}`;
	const random = clean.match(/^\/random\/([^/]+)$/);
	if (random) {
		const state = datasetStore.get();
		const kind = random[1]!;
		return state.status === "ready" && isRandomKind(kind) ? (randomPath(state.db, kind) ?? "/") : "/";
	}
	// everything else (including /lab and /lab/...) is the same path in the app
	return clean + query;
}

export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
	try {
		if (path.startsWith("/")) {
			const [, rest = "/", query = "", hash = ""] = path.match(/^([^?#]*)(\?[^#]*)?(#.*)?$/) ?? [];
			return appPath(rest, query, hash.slice(1));
		}
		const m = path.match(/^([a-z][a-z0-9+.-]*):\/\/([^/?#]*)([^?#]*)(\?[^#]*)?(#.*)?$/i);
		if (!m) return path;
		const [, scheme = "", host = "", rest = "", query = "", hash = ""] = m;
		const s = scheme.toLowerCase();
		if (s === "https" || s === "http") return WEB_HOSTS.has(host.toLowerCase()) ? appPath(rest || "/", query, hash.slice(1)) : path;
		if (s === "pitwall") {
			// the development build's own links (pitwall://expo-development-client/...) pass through untouched
			if (host === "expo-development-client") return path;
			// pitwall://drivers/x puts "drivers" in the host; pitwall:///drivers/x doesn't
			return appPath(`${host ? `/${host}` : ""}${rest}` || "/", query, hash.slice(1));
		}
		return path;
	} catch {
		return path;
	}
}
