// The home page's way into the rest of the app: today's puzzles and the Explore grid.

import { dayIndex, msToNextPuzzle, readPlayLog } from "@pitwall/core/game/daily";
import type { HomeView } from "@pitwall/core/f1/views";
import { useFocusEffect } from "expo-router";
import {
	Calculator,
	CalendarDays,
	CalendarRange,
	CircleCheck,
	Cog,
	Dices,
	Factory,
	Flag as FlagIcon,
	GitCompareArrows,
	Globe,
	MapPin,
	Target,
	Timer,
	Trophy,
	Users,
	type LucideIcon,
} from "lucide-react-native";
import { memo, useCallback, useEffect, useState } from "react";
import { View } from "react-native";
import { Button, Icon, Section, Text } from "@/components/ui";
import { useDb } from "@/data/dataset";
import { num } from "@/lib/format";
import { DAILY_GAMES } from "./games";
import { MoreLink, Tile, TileGrid } from "./kit";
import { randomPath, type RandomKind } from "./random";

type Go = (path: string) => void;

/* ------------------------------------------------------- today's puzzles --- */

/** Today's finished games, read again whenever Home comes back into view (after playing one). */
function usePlayedToday() {
	const [state, setState] = useState(() => ({ day: dayIndex(), done: new Set<string>() }));
	const read = useCallback(() => {
		const day = dayIndex();
		setState({ day, done: new Set(readPlayLog().find(([d]) => d === day)?.[1] ?? []) });
	}, []);
	useFocusEffect(read);
	return { ...state, reread: read };
}

export const Puzzles = memo(function Puzzles({ go }: { go: Go }) {
	const { done, reread } = usePlayedToday();
	const count = DAILY_GAMES.filter((g) => done.has(g.id)).length;
	return (
		<Section
			title="Today's puzzles"
			description={`${DAILY_GAMES.length} daily games, the same for everyone${count ? ` · ${count} of ${DAILY_GAMES.length} played` : ""}`}
			action={<MoreLink label="All games" onPress={() => go("/play")} />}
		>
			<TileGrid className="mt-2">
				{DAILY_GAMES.map((g) => {
					const played = done.has(g.id);
					return <Tile key={g.id} icon={played ? CircleCheck : g.icon} tone={played ? "success" : "primary"} label={g.title} detail={played ? "Played today" : undefined} onPress={() => go(g.href)} />;
				})}
			</TileGrid>
			<Countdown onRollover={reread} />
		</Section>
	);
});

const pad = (n: number) => String(n).padStart(2, "0");

/** Time to the next puzzles (UTC midnight), ticking every second; on its own so only it re-renders. */
function Countdown({ onRollover }: { onRollover: () => void }) {
	const [ms, setMs] = useState(() => msToNextPuzzle());
	useEffect(() => {
		let day = dayIndex();
		const t = setInterval(() => {
			setMs(msToNextPuzzle());
			if (dayIndex() !== day) {
				day = dayIndex();
				onRollover();
			}
		}, 1000);
		return () => clearInterval(t);
	}, [onRollover]);
	const s = Math.floor(ms / 1000);
	return (
		<View className="mt-3 flex-row items-center gap-1.5 px-4">
			<Icon icon={Timer} tone="muted" size={14} />
			<Text variant="caption">
				New puzzles in{" "}
				<Text variant="caption" className="font-semibold tabular-nums text-foreground">
					{pad(Math.floor(s / 3600))}:{pad(Math.floor(s / 60) % 60)}:{pad(s % 60)}
				</Text>
			</Text>
		</View>
	);
}

/* --------------------------------------------------------------- explore --- */

export const Explore = memo(function Explore({ view, go }: { view: HomeView; go: Go }) {
	const db = useDb();
	const links: { href: string; icon: LucideIcon; label: string; detail: string }[] = [
		{ href: "/seasons", icon: CalendarRange, label: "Seasons", detail: `${view.totals.seasons} championships` },
		{ href: "/drivers", icon: Users, label: "Drivers", detail: `${num(view.totals.drivers)} who raced` },
		{ href: "/constructors", icon: Factory, label: "Constructors", detail: `${view.totals.constructors} teams` },
		{ href: "/circuits", icon: MapPin, label: "Circuits", detail: `${view.counts.circuits} tracks` },
		{ href: "/grands-prix", icon: FlagIcon, label: "Grands Prix", detail: `${view.counts.grandsPrix} events` },
		{ href: "/engines", icon: Cog, label: "Engines", detail: `${view.counts.engines} makers` },
		{ href: "/nations", icon: Globe, label: "Nations", detail: `${view.counts.nations} countries` },
		{ href: "/records", icon: Trophy, label: "Records", detail: "Every all-time list" },
		{ href: "/diary", icon: CalendarDays, label: "Diary", detail: "Every day of the year" },
		{ href: "/milestones", icon: Target, label: "Milestones", detail: "Records within reach" },
		{ href: "/compare", icon: GitCompareArrows, label: "Compare", detail: "Head to head" },
		{ href: "/points", icon: Calculator, label: "Points systems", detail: "Rescore history" },
	];
	const random = (kind: RandomKind) => {
		const path = randomPath(db, kind);
		if (path) go(path);
	};
	return (
		<Section title="Explore" description="Everything on Pitwall, from 1950 to today">
			<TileGrid className="mt-2">
				{links.map((l) => (
					<Tile key={l.href} icon={l.icon} label={l.label} detail={l.detail} onPress={() => go(l.href)} />
				))}
			</TileGrid>
			<View className="mt-3 flex-row flex-wrap gap-2 px-4">
				{(["race", "driver", "season"] as const).map((k) => (
					<Button key={k} label={`Random ${k}`} icon={Dices} variant="outline" size="sm" onPress={() => random(k)} />
				))}
			</View>
		</Section>
	);
});
