// The global search sheet, opened from every tab's search button. Results open in the tab the user
// was on: the sheet closes and the screen is pushed onto that tab's stack.

import { useRouter } from "expo-router";
import {
	CalendarDays,
	Clock,
	Cog,
	Flag as FlagIcon,
	Globe,
	ListOrdered,
	MapPin,
	SearchX,
	Trophy,
	User,
	Users,
	type LucideIcon,
} from "lucide-react-native";
import { memo, useDeferredValue, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Flag } from "@/components/f1";
import { EmptyState, Icon, LoadingState, ReadableWidth, Row, SearchField, Section, Text } from "@/components/ui";
import { useDb } from "@/data/dataset";
import { useOpenInCurrentTab } from "@/lib/links";
import { addRecent, clearRecent, recentStore } from "./recent";
import { preparedIndex, search, type ResultKind, type SearchItem } from "./searchData";

const ICONS: Record<ResultKind, LucideIcon> = {
	driver: User,
	constructor: Users,
	grandPrix: Trophy,
	race: FlagIcon,
	circuit: MapPin,
	engine: Cog,
	tyre: Cog,
	nation: Globe,
	season: CalendarDays,
	record: ListOrdered,
};

/** Shown with an empty box, as the website's search does. */
const SECTIONS: { label: string; path: string; icon: LucideIcon }[] = [
	{ label: "Seasons", path: "/seasons", icon: CalendarDays },
	{ label: "Drivers", path: "/drivers", icon: User },
	{ label: "Constructors", path: "/constructors", icon: Users },
	{ label: "Circuits", path: "/circuits", icon: MapPin },
	{ label: "Grands Prix", path: "/grands-prix", icon: Trophy },
	{ label: "Engines", path: "/engines", icon: Cog },
	{ label: "Tyres", path: "/tyres", icon: Cog },
	{ label: "Nations", path: "/nations", icon: Globe },
	{ label: "Records", path: "/records", icon: ListOrdered },
];

const PER_GROUP = 6;
const EXPANDED_MAX = 60;

export function SearchScreen() {
	const db = useDb();
	const router = useRouter();
	const open = useOpenInCurrentTab();
	const insets = useSafeAreaInsets();
	const [query, setQuery] = useState("");
	const deferred = useDeferredValue(query);
	// the group opened with "Show more", for the query it was opened on
	const [expanded, setExpanded] = useState<{ kind: ResultKind; query: string } | null>(null);
	const recent = recentStore.use();

	// Built just after the sheet appears, so opening it never waits on the index.
	const [index, setIndex] = useState<ReturnType<typeof preparedIndex> | null>(null);
	useEffect(() => {
		const t = setTimeout(() => setIndex(preparedIndex(db)), 0);
		return () => clearTimeout(t);
	}, [db]);

	const groups = useMemo(() => (index ? search(index, deferred) : []), [index, deferred]);

	const go = (path: string) => {
		router.back();
		open(path);
	};
	const choose = (item: SearchItem) => {
		addRecent(item);
		go(item.path);
	};

	const q = query.trim();
	return (
		<View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
			<ReadableWidth className="flex-row items-center gap-2 px-4 pb-2 pt-2">
				<SearchField value={query} onChangeText={setQuery} autoFocus placeholder="Drivers, teams, races, seasons…" className="flex-1" accessibilityLabel="Search Pitwall" />
				<Pressable accessibilityRole="button" hitSlop={8} onPress={() => router.back()} className="h-11 justify-center px-1 active:opacity-60">
					<Text variant="label" className="text-link">
						Cancel
					</Text>
				</Pressable>
			</ReadableWidth>
			<ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
				<ReadableWidth>
					{!q ? (
						<>
							{recent.length ? (
								<Section title="Recent" className="mt-2" action={<ClearButton />}>
									{recent.map((item, i, all) => (
										<ResultRow key={item.path} item={item} icon={Clock} onChoose={choose} last={i === all.length - 1} />
									))}
								</Section>
							) : null}
							<Section title="Browse" className={recent.length ? undefined : "mt-2"}>
								{SECTIONS.map((s, i, all) => (
									<Row key={s.path} icon={s.icon} title={s.label} onPress={() => go(s.path)} last={i === all.length - 1} />
								))}
							</Section>
						</>
					) : !index ? (
						<LoadingState />
					) : !groups.length ? (
						<EmptyState icon={SearchX} title={`No results for “${q}”`} body="Try a surname, a team, a circuit or a year." />
					) : (
						groups.map((g, gi) => {
							const isOpen = expanded?.kind === g.kind && expanded.query === deferred;
							const shown = g.items.slice(0, isOpen ? EXPANDED_MAX : PER_GROUP);
							const rest = g.items.length - shown.length;
							return (
								<Section key={g.kind} title={g.heading} className={gi === 0 ? "mt-2" : "mt-5"}>
									{shown.map((item, i) => (
										<ResultRow key={item.path} item={item} onChoose={choose} last={i === shown.length - 1 && (isOpen || rest <= 0)} />
									))}
									{!isOpen && rest > 0 ? (
										<Pressable accessibilityRole="button" onPress={() => setExpanded({ kind: g.kind, query: deferred })} className="min-h-11 justify-center px-4 active:bg-accent">
											<Text variant="small" className="font-semibold text-link">
												Show {Math.min(rest, EXPANDED_MAX - PER_GROUP)} more
											</Text>
										</Pressable>
									) : null}
								</Section>
							);
						})
					)}
				</ReadableWidth>
			</ScrollView>
		</View>
	);
}

function ClearButton() {
	return (
		<Pressable accessibilityRole="button" accessibilityLabel="Clear recent searches" hitSlop={12} onPress={clearRecent} className="py-1 active:opacity-60">
			<Text variant="small" className="font-semibold text-link">
				Clear
			</Text>
		</Pressable>
	);
}

const ResultRow = memo(function ResultRow({ item, icon, onChoose, last }: { item: SearchItem; icon?: LucideIcon; onChoose: (item: SearchItem) => void; last?: boolean }) {
	const leading = (
		<View className="w-7 items-center">{icon || !item.flag ? <Icon icon={icon ?? ICONS[item.kind]} tone="muted" size={18} /> : <Flag code={item.flag} className="text-[18px]" />}</View>
	);
		// long details (a race's circuit, a record's list) go underneath; years and towns sit on the right
	const below = item.kind === "record" || item.kind === "race";
	const detail = item.detail ?? "";
	return <Row leading={leading} title={item.label} value={below ? null : detail || null} subtitle={below ? detail || null : null} onPress={() => onChoose(item)} chevron={false} last={last} />;
});
