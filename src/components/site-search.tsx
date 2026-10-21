"use client";

// Global search (Ctrl/Cmd+K) over drivers, constructors, circuits, Grands Prix,
// engines, tyres, nations and seasons. The compact index (~24 KB gzipped) is a static
// file (public/data/search-index.json, written by the data build; the /search-index
// route is the fallback) prefetched once the page is idle, so it is ready by the time
// anyone types and normal page loads don't wait for it. Inside a universe, the universe's
// own drivers, teams and simulated seasons are added from the universe the page
// has already applied (see publishActiveUniverse), and results stay inside it.

import { useCallback, useDeferredValue, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, CircleAlert, Cog, Flag as FlagIcon, Globe, MapPin, Search, Sparkles, Trophy, User, Users } from "lucide-react";
import type { SearchEntry, SearchKind } from "@/lib/f1/views";
import { universeSearchEntries } from "@/lib/universe/search";
import { Flag } from "./f1";
import { useActiveUniverse } from "./universe-link";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "./ui/command";
import { Kbd } from "./ui/kbd";
import { Spinner } from "./ui/spinner";

const KINDS: { kind: SearchKind; heading: string; path: string; icon: typeof User }[] = [
	{ kind: "driver", heading: "Drivers", path: "/drivers/", icon: User },
	{ kind: "constructor", heading: "Constructors", path: "/constructors/", icon: Users },
	{ kind: "grandPrix", heading: "Grands Prix", path: "/grands-prix/", icon: Trophy },
	{ kind: "circuit", heading: "Circuits", path: "/circuits/", icon: MapPin },
	{ kind: "engine", heading: "Engines", path: "/engines/", icon: Cog },
	{ kind: "tyre", heading: "Tyres", path: "/tyres/", icon: Cog },
	{ kind: "nation", heading: "Nations", path: "/nations/", icon: Globe },
	{ kind: "season", heading: "Seasons", path: "/seasons/", icon: CalendarDays },
];

const SECTIONS = [
	{ label: "Seasons", href: "/seasons", icon: CalendarDays },
	{ label: "Drivers", href: "/drivers", icon: User },
	{ label: "Constructors", href: "/constructors", icon: Users },
	{ label: "Circuits", href: "/circuits", icon: MapPin },
	{ label: "Grands Prix", href: "/grands-prix", icon: Trophy },
	{ label: "Engines", href: "/engines", icon: Cog },
	{ label: "Tyres", href: "/tyres", icon: Cog },
	{ label: "Nations", href: "/nations", icon: Globe },
	{ label: "Records", href: "/records", icon: FlagIcon },
];

const PER_GROUP = 6;
const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** `universe`: exists only in the active universe. */
type Prepared = { entry: SearchEntry; label: string; words: string[]; universe?: boolean };
const prepare = (entry: SearchEntry, universe?: boolean): Prepared => ({
	entry,
	label: fold(entry[2]),
	words: fold(`${entry[2]} ${entry[4]}`).split(/[\s\-.,'()]+/).filter(Boolean),
	universe,
});

/** Lower is better; null = no match. Every query token must prefix a word or appear in the name. */
function score(p: Prepared, tokens: string[], whole: string): number | null {
	let total = 0;
	for (const t of tokens) {
		if (p.words.some((w) => w.startsWith(t))) continue;
		if (p.label.includes(t)) {
			total += 2;
			continue;
		}
		return null;
	}
	if (p.label === whole) return -2;
	if (p.label.startsWith(whole)) return -1;
	return total;
}

let indexPromise: Promise<SearchEntry[]> | undefined;
const loadIndex = () =>
	(indexPromise ??= fetch("/data/search-index.json")
		.then((r) => (r.ok ? r : fetch("/search-index")))
		.then((r) => {
			if (!r.ok) throw new Error(`HTTP ${r.status}`);
			return r.json() as Promise<SearchEntry[]>;
		})
		.catch((e) => {
			indexPromise = undefined;
			throw e;
		}));

const subscribeNoop = () => () => {};
const isMac = () => /Mac|iPhone|iPad/.test(navigator.platform);

export function SiteSearch({ prefix }: { prefix: string }) {
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState("");
	const [index, setIndex] = useState<Prepared[] | null>(null);
	const [error, setError] = useState(false);
	const mac = useSyncExternalStore(subscribeNoop, isMac, () => false);
	const deferred = useDeferredValue(query);
	const universeId = prefix.match(/^\/u\/([^/]+)/)?.[1] ?? null;
	const universe = useActiveUniverse(universeId);
	// built on first open from the universe the page already applied (cached per universe)
	const extras = useMemo(() => (open && universe ? universeSearchEntries(universe.db, universe.base).map((e) => prepare(e, true)) : []), [open, universe]);
	const all = useMemo(() => (index && extras.length ? [...index, ...extras] : index), [index, extras]);

	const load = useCallback(() => {
		if (index) return;
		loadIndex()
			.then((entries) => {
				setIndex(entries.map((entry) => prepare(entry)));
				setError(false);
			})
			.catch(() => setError(true));
	}, [index]);

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
				e.preventDefault();
				setOpen((o) => !o);
			}
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, []);

	useEffect(() => {
		if (open) load();
	}, [open, load]);

	// warm the index in the background after the page settles
	useEffect(() => {
		if (typeof requestIdleCallback === "undefined") {
			const t = setTimeout(load, 1500);
			return () => clearTimeout(t);
		}
		const id = requestIdleCallback(load, { timeout: 4000 });
		return () => cancelIdleCallback(id);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	const groups = useMemo(() => {
		const q = fold(deferred.trim());
		if (!q || !all) return [];
		const tokens = q.split(/\s+/).filter(Boolean);
		const hits = new Map<SearchKind, { p: Prepared; s: number; i: number }[]>();
		all.forEach((p, i) => {
			const s = score(p, tokens, q);
			if (s == null) return;
			const list = hits.get(p.entry[0]) ?? [];
			list.push({ p, s, i });
			hits.set(p.entry[0], list);
		});
		return KINDS.map((k) => ({
			...k,
			items: (hits.get(k.kind) ?? [])
				.sort((a, b) => a.s - b.s || a.i - b.i)
				.slice(0, PER_GROUP)
				.map((h) => h.p),
		}))
			.filter((g) => g.items.length)
			// best match first: groups ordered by their top result
			.sort((a, b) => {
				const best = (g: typeof a) => Math.min(...(hits.get(g.kind) ?? []).map((h) => h.s));
				return best(a) - best(b);
			});
	}, [deferred, all]);

	const go = (path: string) => {
		setOpen(false);
		setQuery("");
		router.push(prefix + path);
	};

	const q = query.trim();
	return (
		<>
			<Button
				variant="outline"
				onClick={() => setOpen(true)}
				onPointerEnter={load}
				onFocus={load}
				aria-label="Search"
				className="text-muted-foreground w-9 justify-center px-0 sm:w-56 sm:justify-start sm:px-3"
			>
				<Search data-icon="inline-start" />
				<span className="hidden sm:inline">Search</span>
				<Kbd className="ml-auto hidden sm:inline-flex">{mac ? "⌘" : "Ctrl"} K</Kbd>
			</Button>
			<CommandDialog
				open={open}
				onOpenChange={(o) => {
					setOpen(o);
					if (!o) setQuery("");
				}}
				title="Search Pitwall"
				description="Find drivers, constructors, circuits, Grands Prix, engines, nations and seasons"
				commandProps={{ shouldFilter: false }}
			>
				<CommandInput value={query} onValueChange={setQuery} placeholder="Search drivers, teams, circuits, Grands Prix, engines, nations, seasons" />
				<CommandList className="max-h-[min(60vh,28rem)]">
					{!q ? (
						<CommandGroup heading="Browse">
							{SECTIONS.map((s) => (
								<CommandItem key={s.href} value={s.href} onSelect={() => go(s.href)}>
									<s.icon />
									{s.label}
								</CommandItem>
							))}
						</CommandGroup>
					) : error ? (
						<div className="text-muted-foreground flex items-center justify-center gap-2 py-6 text-sm">
							<CircleAlert className="size-4" /> Couldn&apos;t load the search index.
						</div>
					) : !index ? (
						<div className="text-muted-foreground flex items-center justify-center gap-2 py-6 text-sm">
							<Spinner /> Loading
						</div>
					) : (
						<>
							<CommandEmpty>No results for &ldquo;{q}&rdquo;.</CommandEmpty>
							{groups.map((g) => (
								<CommandGroup key={g.kind} heading={g.heading}>
									{g.items.map(({ entry: [kind, id, label, flag, extra], universe: own }) => (
										<CommandItem key={`${kind}:${id}`} value={`${kind}:${id}`} onSelect={() => go(g.path + id)}>
											{flag ? <Flag code={flag} /> : <g.icon />}
											<span className="truncate">{label}</span>
											{own && (
												<Badge variant="secondary" className="bg-universe/15 text-universe shrink-0 gap-1">
													<Sparkles className="size-3" />
													This universe
												</Badge>
											)}
											{extra && kind !== "nation" && <span className="text-muted-foreground ml-auto truncate pl-3 text-xs">{extra}</span>}
										</CommandItem>
									))}
								</CommandGroup>
							))}
							{universeId && !universe && (
								<div className="text-muted-foreground flex items-center gap-2 px-3 py-2 text-xs">
									<Spinner /> Loading this universe&apos;s own drivers, teams and seasons
								</div>
							)}
						</>
					)}
				</CommandList>
			</CommandDialog>
		</>
	);
}
