// "Teammate chain" (/play/chain): the website's components/play/chain.tsx for the phone. The chain
// runs down the screen from A to B with the picker in the gap; names only open their pages once
// the game is over (a driver's page lists their teams, which would give links away).

import { Dices, Flag as FlagIcon, Lightbulb, Link2, Undo2, X } from "lucide-react-native";
import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { AccessibilityInfo, View } from "react-native";
import Animated, { FadeIn, FadeInUp, useReducedMotion } from "react-native-reanimated";
import { type GameMode } from "@pitwall/core/game/daily";
import {
	bottomEnd,
	bucketLabel,
	canHint,
	classify,
	DIFFICULTIES,
	driverWeight,
	fullChain,
	GIVE_UP,
	groupStints,
	HINT,
	linkCount,
	linkLabel,
	linkOf,
	MAX_STRIKES,
	overPar,
	puzzleNumber,
	scoreBucket,
	shareText,
	shortestChain,
	strikesUsed,
	topEnd,
	UNDO,
	type ChainDriver,
	type ChainState,
	type Graph,
	type HintInfo,
	type Stint,
	type Strike,
} from "@pitwall/core/game/chain";
import { Flag } from "@/components/f1";
import { Button, Icon, Text } from "@/components/ui";
import { cn } from "@/lib/cn";
import { webUrl } from "@/lib/config";
import { haptic } from "@/lib/haptics";
import { href, useOpen } from "@/lib/links";
import { ChoiceToggle, EntityPicker, Figures, GameError, GameHeader, GameLoading, GameScreen, LegendItem, ResultCard, shareResult, StatsPanel, useDbData, useToday, useVerdictTone, VERDICT_STYLE } from "@/features/play/kit";
import { chainLoader } from "../data";
import { NameLink } from "../parts";
import { useChain } from "./useChain";

const span = (d: ChainDriver) => (d.first === d.last ? String(d.first) : `${d.first}–${d.last}`);
const teamsText = (g: Graph, stints: Stint[]) => groupStints(stints).map((t) => g.teams[t.team]?.name).join(" / ");

export function ChainScreen() {
	const { data, error, retry } = useDbData(chainLoader);
	const { today, rollover } = useToday();
	if (data) return <ChainGame key={today} g={data} today={today} rollover={rollover} />;
	return (
		<GameScreen title="Teammate chain" today={today} mode="daily">
			{error ? <GameError what="the team-mate chains" onRetry={retry} /> : <GameLoading />}
		</GameScreen>
	);
}

function statusLine(s: ChainState): string {
	if (!s.solved) return s.gaveUp ? "You gave up. One shortest chain:" : "Out of strikes. One shortest chain:";
	const score = `Par ${s.pair.par} · You ${linkCount(s)}`;
	return overPar(s) === 0 ? `Connected! ${score}, a perfect chain.` : `Connected! ${score}.`;
}

/** What an action just did, for screen readers and the line under the picker. */
function describe(g: Graph, before: ChainState, after: ChainState, action: string): string {
	const name = (i: number) => g.drivers[i].name;
	if (action === UNDO) return "Last link taken back.";
	if (action === GIVE_UP) return "You gave up.";
	if (action === HINT && after.hint) return `Hint: a ${teamsText(g, after.hint.stints)} team-mate of ${name(after.hint.from)}.`;
	if (after.strikes.length > before.strikes.length) {
		const x = after.strikes[after.strikes.length - 1];
		return `${name(x.driver)} was never team-mates with ${name(x.top)} or ${name(x.bottom)}. Strike ${strikesUsed(after)} of ${MAX_STRIKES}.`;
	}
	const end = after.placed[after.placed.length - 1];
	const list = after[end];
	const added = list[list.length - 1];
	return `${name(added)} added: ${linkLabel(g, linkOf(g, list[list.length - 2], added)!)}.${after.solved ? " Chain connected!" : ""}`;
}

function ChainGame({ g, today, rollover }: { g: Graph; today: number; rollover: () => void }) {
	const c = useChain(g, today);
	const [statsOpen, setStatsOpen] = useState(false);
	const [announce, setAnnounce] = useState("");
	const { state, mode } = c;
	const items = useMemo(() => g.drivers.map((d) => ({ id: d.id, label: d.name, sublabel: span(d), weight: driverWeight(d), driver: d })), [g]);
	const exclude = useMemo(() => [...c.exclude], [c.exclude]);

	const act = (action: string) => {
		const res = c.act(action);
		if (!res) return;
		// the board shows what happened; screen readers hear it
		AccessibilityInfo.announceForAccessibility(describe(g, res.before, res.after, action));
		setAnnounce("");
		if (action === UNDO || action === HINT || action === GIVE_UP) return;
		if (res.after.strikes.length > res.before.strikes.length) haptic("error");
		else haptic("success");
	};

	const pick = (d: ChainDriver) => {
		if (!state) return;
		if (classify(g, state, d.i) === "repeat") setAnnounce(`${d.name} is already in the chain or ruled out here.`);
		else act(d.id);
	};

	const share = () => {
		if (!state) return;
		const diff = c.difficulty === "hard" ? " (Hard)" : "";
		const label = mode === "daily" ? `#${puzzleNumber(today)}${diff}` : `practice${diff}`;
		void shareResult(shareText(g, state, { label, url: webUrl("/play/chain") }));
	};

	const level = DIFFICULTIES.find((d) => d.id === c.difficulty)!;
	return (
		<GameScreen title="Teammate chain" today={today} mode={mode} onStats={() => setStatsOpen(true)}>
			<GameHeader
				mode={mode}
				onModeChange={(m) => {
					c.setMode(m);
					setAnnounce("");
				}}
				controls={<ChoiceToggle value={c.difficulty} options={DIFFICULTIES} onChange={(d) => { c.setDifficulty(d); setAnnounce(""); }} />}
			>
				<Text variant="muted">
					Link the two drivers through team-mates (entered for the same constructor in the same race) in as few links as you can. Name a team-mate of either
					end and the chain grows from both sides until they meet. A wrong pick or a hint costs one of your {MAX_STRIKES} strikes; undo is free. {level.description}. A new
					pair every day at midnight UTC.
				</Text>
			</GameHeader>

			{!state ? (
				<GameLoading />
			) : (
				<>
					{state.over ? (
						<ResultCard
							won={state.solved}
							status={statusLine(state)}
							mode={mode}
							nextLabel={mode === "practice" ? "Next practice pair" : "Practice with a random pair"}
							countdownLabel="Next pair in"
							onShare={share}
							onStats={() => setStatsOpen(true)}
							onNext={() => {
								c.newPractice();
								setAnnounce("");
							}}
							onRollover={rollover}
						>
							<Reveal g={g} state={state} />
						</ResultCard>
					) : (
						<Controls state={state} mode={mode} onAct={act} onNewPair={() => { c.newPractice(); setAnnounce(""); }} />
					)}
					<Board g={g} state={state} items={items} exclude={exclude} announce={announce} onPick={pick} />
					<View className="mt-6 gap-2 px-4">
						<LegendItem verdict="match" icon={Link2}>
							Team-mates: the link shows the team and seasons
						</LegendItem>
						<LegendItem verdict="miss" icon={X}>
							Never team-mates: a strike
						</LegendItem>
						<LegendItem verdict="close" icon={Lightbulb}>
							Hint: a team on a shortest route, for a strike
						</LegendItem>
					</View>
				</>
			)}

			<StatsPanel
				open={statsOpen}
				onClose={() => setStatsOpen(false)}
				stats={c.stats}
				today={today}
				description={`Daily puzzles, ${level.label.toLowerCase()}. Saved on this phone.`}
				distributionTitle="Links over par"
				distributionLabel="Wins by links over par"
				bucketLabel={bucketLabel}
				bucketSrLabel={(i) => `wins at ${i === 0 ? "par" : `${bucketLabel(i)} over par`}`}
				labelWidth={30}
				highlight={mode === "daily" && state?.solved ? scoreBucket(state) : null}
			/>
		</GameScreen>
	);
}

/* ------------------------------------------------------------- controls --- */

function Controls({ state, mode, onAct, onNewPair }: { state: ChainState; mode: GameMode; onAct: (a: string) => void; onNewPair: () => void }) {
	const used = strikesUsed(state);
	return (
		<View className="gap-3 px-4 pt-3">
			<View className="flex-row items-center gap-5">
				<Text variant="small">
					<Text variant="small" className="text-muted-foreground">
						Par{" "}
					</Text>
					<Text variant="small" className="font-semibold tabular-nums">
						{state.pair.par}
					</Text>
				</Text>
				<Text variant="small">
					<Text variant="small" className="text-muted-foreground">
						Links{" "}
					</Text>
					<Text variant="small" className="font-semibold tabular-nums">
						{linkCount(state)}
					</Text>
				</Text>
				<View className="flex-row items-center gap-1.5" accessible accessibilityLabel={`${used} of ${MAX_STRIKES} strikes used`}>
					<Text variant="small" className="text-muted-foreground">
						Strikes
					</Text>
					{Array.from({ length: MAX_STRIKES }, (_, i) => (
						<View key={i} className={cn("h-4 w-4 items-center justify-center rounded-full", i < used ? "bg-destructive" : "border border-border")}>
							{i < used ? <X color="#ffffff" size={10} strokeWidth={3} /> : null}
						</View>
					))}
				</View>
			</View>
			<View className="flex-row flex-wrap gap-2">
				<Button label="Undo" icon={Undo2} variant="outline" size="sm" disabled={!state.placed.length} onPress={() => onAct(UNDO)} />
				<Button label="Hint" icon={Lightbulb} variant="outline" size="sm" disabled={!canHint(state)} onPress={() => onAct(HINT)} />
				{mode === "practice" ? (
					<Button label="New pair" icon={Dices} variant="ghost" size="sm" onPress={onNewPair} />
				) : (
					<Button label="Give up" icon={FlagIcon} variant="ghost" size="sm" onPress={() => onAct(GIVE_UP)} />
				)}
			</View>
		</View>
	);
}

/* ---------------------------------------------------------------- board --- */

type Item = { kind: "driver"; i: number; role: "a" | "b" | "link" } | { kind: "link"; stints: Stint[] } | { kind: "gap"; content: ReactNode };

/** Whether names open their pages: off on the board while the game is on. */
const Linked = createContext(true);

function ChainList({ g, items, compact }: { g: Graph; items: Item[]; compact?: boolean }) {
	return (
		<View>
			{items.map((item, k) => {
				const above = items[k - 1]?.kind;
				const below = items[k + 1]?.kind;
				if (item.kind === "driver") return <DriverRow key={`d${item.i}`} d={g.drivers[item.i]} role={item.role} above={above} below={below} compact={compact} />;
				if (item.kind === "link") return <LinkRow key={`l${k}`} g={g} stints={item.stints} compact={compact} />;
				return <GapRow key="gap">{item.content}</GapRow>;
			})}
		</View>
	);
}

const RAIL = 32;

function RailHalf({ kind }: { kind: Item["kind"] | undefined }) {
	if (kind === "link") return <View className="w-0.5 flex-1 bg-success/60" />;
	if (kind === "gap") return <View className="w-0 flex-1 border-l-2 border-dashed border-border" />;
	return <View className="w-0.5 flex-1" />;
}

function DriverRow({ d, role, above, below, compact }: { d: ChainDriver; role: "a" | "b" | "link"; above?: Item["kind"]; below?: Item["kind"]; compact?: boolean }) {
	const end = role !== "link";
	const linked = useContext(Linked);
	const open = useOpen();
	const reduced = useReducedMotion();
	const tone = useVerdictTone("match");
	const node = compact ? 24 : 32;
	return (
		<Animated.View entering={reduced ? undefined : FadeInUp.duration(300)} className="flex-row gap-3" accessible={!linked} accessibilityLabel={`${d.name}${end ? (role === "a" ? " (start)" : " (finish)") : ""}`}>
			<View style={{ width: RAIL }} className="items-center">
				<RailHalf kind={above} />
				<View style={{ width: node, height: node }} className={cn("items-center justify-center rounded-full", end ? "bg-foreground" : VERDICT_STYLE.match.box)}>
					{end ? (
						<Text className={cn("font-bold text-background", compact ? "text-[11px]" : "text-[12px]")}>{role.toUpperCase()}</Text>
					) : (
						<Icon icon={Link2} tone={tone} size={compact ? 12 : 14} strokeWidth={2.5} />
					)}
				</View>
				<RailHalf kind={below} />
			</View>
			<View className={cn("min-w-0 flex-1 flex-row items-center gap-2 rounded-md border bg-card", compact ? "my-0.5 px-2.5 py-1.5" : "my-1 px-3 py-2.5", end ? "border-foreground/25" : "border-border")}>
				<Flag code={d.flag} />
				<View className="min-w-0 flex-1">
					<NameLink onPress={linked ? () => open(href.driver(d.id)) : undefined} className={end ? "font-bold" : undefined}>
						{d.name}
					</NameLink>
				</View>
				<Text variant="caption" className="tabular-nums">
					{span(d)}
				</Text>
			</View>
		</Animated.View>
	);
}

function LinkRow({ g, stints, compact }: { g: Graph; stints: Stint[]; compact?: boolean }) {
	return (
		<View className="flex-row gap-3">
			<View style={{ width: RAIL }} className="items-center">
				<View className="w-0.5 flex-1 bg-success/60" />
			</View>
			<View className={cn("min-w-0 flex-1 justify-center", compact ? "min-h-5 py-0.5" : "min-h-8 py-1")}>
				<TeamsLabel g={g} stints={stints} />
			</View>
		</View>
	);
}

/** "McLaren, 1988–1989 · Williams, 1993": team names open their pages once the game is over. */
function TeamsLabel({ g, stints }: { g: Graph; stints: Stint[] }) {
	const linked = useContext(Linked);
	const open = useOpen();
	return (
		<View className="flex-row flex-wrap items-center" accessible accessibilityLabel={`Team-mates at ${linkLabel(g, stints)}`}>
			{groupStints(stints).map((t, k) => {
				const team = g.teams[t.team];
				return (
					<View key={t.team} className="flex-row items-center">
						{k > 0 ? <Text variant="caption"> · </Text> : null}
						{linked ? (
							<NameLink onPress={() => open(href.team(team.id))} className="text-[12px] leading-4">
								{team.name}
							</NameLink>
						) : (
							<Text variant="caption" className="font-semibold text-foreground/80">
								{team.name}
							</Text>
						)}
						<Text variant="caption" className="tabular-nums">
							, {t.ranges.join(", ")}
						</Text>
					</View>
				);
			})}
		</View>
	);
}

function GapRow({ children }: { children: ReactNode }) {
	return (
		<View className="flex-row gap-3">
			<View style={{ width: RAIL }} className="items-center">
				<View className="w-0 flex-1 border-l-2 border-dashed border-border" />
			</View>
			<View className="min-w-0 flex-1 py-2">{children}</View>
		</View>
	);
}

type PickerItem = { id: string; label: string; sublabel: string; weight: number; driver: ChainDriver };

function Board({ g, state, items: pickerItems, exclude, announce, onPick }: { g: Graph; state: ChainState; items: PickerItem[]; exclude: string[]; announce: string; onPick: (d: ChainDriver) => void }) {
	const items: Item[] = [];
	state.top.forEach((i, k) => {
		if (k > 0) items.push({ kind: "link", stints: linkOf(g, state.top[k - 1], i)! });
		items.push({ kind: "driver", i, role: k === 0 ? "a" : "link" });
	});
	if (state.solved) items.push({ kind: "link", stints: linkOf(g, topEnd(state), bottomEnd(state))! });
	else items.push({ kind: "gap", content: <Gap g={g} state={state} items={pickerItems} exclude={exclude} announce={announce} onPick={onPick} /> });
	const bottom: Item[] = [];
	state.bottom.forEach((i, k) => {
		bottom.unshift({ kind: "driver", i, role: k === 0 ? "b" : "link" });
		if (k < state.bottom.length - 1) bottom.unshift({ kind: "link", stints: linkOf(g, i, state.bottom[k + 1])! });
	});
	items.push(...bottom);
	return (
		<View className="mt-4 gap-3 px-4">
			{state.over ? <Text variant="heading">Your chain</Text> : null}
			<Linked value={state.over}>
				<ChainList g={g} items={items} />
			</Linked>
			{state.solved && state.strikes.length > 0 ? (
				<View className="gap-1.5">
					<Text variant="caption">Wrong picks</Text>
					<Strikes g={g} strikes={state.strikes} />
				</View>
			) : null}
		</View>
	);
}

function Gap({ g, state, items, exclude, announce, onPick }: { g: Graph; state: ChainState; items: PickerItem[]; exclude: string[]; announce: string; onPick: (d: ChainDriver) => void }) {
	const t = g.drivers[topEnd(state)];
	const b = g.drivers[bottomEnd(state)];
	return (
		<View className="gap-3 rounded-md border border-dashed border-border py-3">
			{state.over ? (
				<Text variant="muted" className="px-3">
					Not connected.
				</Text>
			) : (
				<>
					<Text variant="small" className="px-3 text-muted-foreground">
						Name a team-mate of <Text variant="small" className="font-semibold">{t.name}</Text> or <Text variant="small" className="font-semibold">{b.name}</Text>
					</Text>
					<EntityPicker className="px-3" items={items} exclude={exclude} onPick={(i) => onPick(i.driver)} label={`A team-mate of ${t.name} or ${b.name}`} placeholder="Type a driver's name…" noun="drivers" />
					{announce ? (
						<Text variant="caption" className="px-3 text-foreground" accessibilityLiveRegion="polite">
							{announce}
						</Text>
					) : null}
					{state.hint ? <HintCallout g={g} hint={state.hint} /> : null}
				</>
			)}
			{state.strikes.length > 0 ? (
				<View className="px-3">
					<Strikes g={g} strikes={[...state.strikes].reverse()} />
				</View>
			) : null}
		</View>
	);
}

function HintCallout({ g, hint }: { g: Graph; hint: HintInfo }) {
	const tone = useVerdictTone("close");
	return (
		<Animated.View entering={FadeIn} className="flex-row items-start gap-2.5 px-3">
			<View className={cn("mt-0.5 h-5 w-5 items-center justify-center rounded", VERDICT_STYLE.close.box)}>
				<Icon icon={Lightbulb} tone={tone} size={12} strokeWidth={2.5} />
			</View>
			<View className="flex-1 gap-0.5">
				<Text variant="small">
					Hint: try a team-mate of <Text variant="small" className="font-semibold">{g.drivers[hint.from].name}</Text> at
				</Text>
				<TeamsLabel g={g} stints={hint.stints} />
			</View>
		</Animated.View>
	);
}

function Strikes({ g, strikes }: { g: Graph; strikes: Strike[] }) {
	return (
		<View className="gap-1.5" accessibilityLabel="Wrong picks">
			{strikes.map((s, k) => {
				const d = g.drivers[s.driver];
				const ends = s.top === s.bottom ? g.drivers[s.top].lastName : `${g.drivers[s.top].lastName} or ${g.drivers[s.bottom].lastName}`;
				return (
					<View key={`${s.driver}-${k}`} className="flex-row items-center gap-2 opacity-75">
						<View className={cn("h-5 w-5 items-center justify-center rounded", VERDICT_STYLE.miss.box)}>
							<Icon icon={X} tone="foreground" size={12} strokeWidth={2.5} />
						</View>
						<Flag code={d.flag} />
						<View className="flex-1">
							<Text variant="small" className="font-semibold line-through">
								{d.name}
							</Text>
							<Text variant="caption">never team-mates with {ends}</Text>
						</View>
					</View>
				);
			})}
		</View>
	);
}

/* --------------------------------------------------------------- reveal --- */

function Reveal({ g, state }: { g: Graph; state: ChainState }) {
	const best = useMemo(() => shortestChain(g, state.pair.a, state.pair.b) ?? [], [g, state.pair]);
	const mine = fullChain(state);
	const same = state.solved && mine.length === best.length && mine.every((x, k) => x === best[k]);
	const items: Item[] = best.flatMap((i, k): Item[] => [
		...(k > 0 ? [{ kind: "link", stints: linkOf(g, best[k - 1], i)! } as const] : []),
		{ kind: "driver", i, role: k === 0 ? "a" : k === best.length - 1 ? "b" : "link" },
	]);
	return (
		<>
			<Figures
				items={[
					["Par", state.pair.par],
					...(state.solved ? ([["Your links", linkCount(state)]] as [string, number][]) : []),
					["Strikes", state.strikes.length],
					["Hints", state.hints.length],
				]}
			/>
			{same ? (
				<Text variant="muted">Your chain is a shortest one: nothing to improve.</Text>
			) : (
				<View className="gap-2">
					<Text variant="caption">{state.solved ? `A shortest chain (${best.length - 1} links)` : `${best.length - 1} links`}</Text>
					<ChainList g={g} items={items} compact />
				</View>
			)}
		</>
	);
}
