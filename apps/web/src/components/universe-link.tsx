"use client";

import Link from "next/link";
import { createContext, useContext, useState, useSyncExternalStore, type ComponentProps } from "react";
import type { Db } from "@pitwall/core/f1/dataset";

export type UniverseInfo = { id: string; name: string };

const UniverseContext = createContext<UniverseInfo | null>(null);

export function UniverseProvider({ universe, children }: { universe: UniverseInfo | null; children: React.ReactNode }) {
	return <UniverseContext.Provider value={universe}>{children}</UniverseContext.Provider>;
}

export const useUniverse = () => useContext(UniverseContext);

/** Prefix a site path with the active universe, so browsing stays inside it. */
export function useSiteHref(href: string) {
	const u = useUniverse();
	if (!u || !href.startsWith("/") || href.startsWith("/lab")) return href;
	return `/u/${u.id}${href === "/" ? "" : href}`;
}

/**
 * Drop-in for next/link for internal site pages. It prefetches when the link is hovered, focused or touched rather
 * than when it scrolls into view: most pages are drawn on their first visit and then cached, so a table of hundreds
 * of links would otherwise draw (and cache, an ISR write each) every page it points to. A `prefetch` prop still wins.
 */
export function ULink({ href, prefetch, onMouseEnter, onFocus, onTouchStart, ...props }: ComponentProps<typeof Link> & { href: string }) {
	const [intent, setIntent] = useState(false);
	return (
		<Link
			href={useSiteHref(href)}
			prefetch={prefetch !== undefined ? prefetch : intent ? null : false}
			onMouseEnter={(e) => {
				setIntent(true);
				onMouseEnter?.(e);
			}}
			onFocus={(e) => {
				setIntent(true);
				onFocus?.(e);
			}}
			onTouchStart={(e) => {
				setIntent(true);
				onTouchStart?.(e);
			}}
			{...props}
		/>
	);
}

/* ------------------------------------------------------- active universe --- */

// The universe page publishes the universe it has applied, so things outside
// its tree (the header's search) can use it without loading or applying
// anything themselves. Only references are shared: nothing is computed here.

export type ActiveUniverse = { id: string; db: Db; base: Db };

let active: ActiveUniverse | null = null;
const listeners = new Set<() => void>();

export function publishActiveUniverse(u: ActiveUniverse | null) {
	if (active === u) return;
	active = u;
	listeners.forEach((fn) => fn());
}

/** Withdraw `u` if it is still the active one (a newer universe may have replaced it). */
export function withdrawActiveUniverse(u: ActiveUniverse) {
	if (active === u) publishActiveUniverse(null);
}

const subscribe = (fn: () => void) => {
	listeners.add(fn);
	return () => {
		listeners.delete(fn);
	};
};

/** The applied universe with this id, once its page has built it (otherwise null). */
export function useActiveUniverse(id: string | null): ActiveUniverse | null {
	const u = useSyncExternalStore(
		subscribe,
		() => active,
		() => null,
	);
	return id && u?.id === id ? u : null;
}
