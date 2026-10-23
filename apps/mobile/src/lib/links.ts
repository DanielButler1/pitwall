// Where things live in the app. Paths match the website's URLs (/drivers/<id>, /races/<year>/<round>,
// ...), so a pitwall.phaseo.app link opens the same screen. Detail screens exist in every tab's
// stack (app/(app)/(home,browse,records,play,lab)/...), and `useOpen` pushes them onto the tab the
// user is in, so Back returns to where they came from.

import { useRouter, useSegments, type Href } from "expo-router";
import { useCallback } from "react";
import { TAB_GROUPS, type TabGroup } from "@/components/shell/navigation";

/** The website's paths, as in apps/web/src/components/f1.tsx `href`. */
export const href = {
	season: (year: number) => `/seasons/${year}`,
	race: (r: { year: number; round: number }) => `/races/${r.year}/${r.round}`,
	driver: (id: string) => `/drivers/${id}`,
	team: (id: string) => `/constructors/${id}`,
	circuit: (id: string) => `/circuits/${id}`,
	engine: (id: string) => `/engines/${id}`,
	tyre: (id: string) => `/tyres/${id}`,
	nation: (id: string) => `/nations/${id}`,
	diary: (slug: string) => `/diary/${slug}`,
	grandPrix: (id: string) => `/grands-prix/${id}`,
	record: (id: string) => `/records/${id}`,
	teammates: (a: string, b: string) => `/teammates/${a}/${b}`,
};

/** The tab the current screen belongs to ((home) when it can't tell). */
export function useTabGroup(): TabGroup {
	const segments = useSegments() as string[];
	return (segments.find((s) => TAB_GROUPS.includes(s as TabGroup)) as TabGroup | undefined) ?? "(home)";
}

/** Opens a website-style path (`/drivers/ayrton-senna`) in the current tab's stack. */
export function useOpen() {
	const router = useRouter();
	const group = useTabGroup();
	return useCallback((path: string) => router.push(`/(app)/${group}${path}` as Href), [router, group]);
}
