// Fantasy: Through the Eras (/play/fantasy): the website's components/play/fantasy.tsx for the
// phone. The challenge, your team (budget, five driver-seasons with a captain, a constructor-season,
// lock in), then the draft list; once locked in, the results, the dream championship and how
// scoring works. Teams and best scores are saved under the website's keys.

import { Lock, Pencil, Star, Trash2, Trophy, X } from "lucide-react-native";
import { useEffect, useMemo, useRef, useState, type ComponentRef } from "react";
import { ScrollView, View } from "react-native";
import { hash } from "@pitwall/core/sim/random";
import {
	dailyChallenge,
	EMPTY_TEAM,
	FREE_PLAY,
	percentile,
	randomTeamScores,
	rating,
	rulesSummary,
	scoreTeam,
	teamCost,
	teamIssues,
	todayUtc,
	type Challenge,
	type Pool,
	type Rules,
	type Team,
} from "@pitwall/core/game/fantasy";
import { DetailScreen, Flag } from "@/components/f1";
import { Badge, Button, Icon, IconButton, ReadableWidth, Section, Text } from "@/components/ui";
import { cn } from "@/lib/cn";
import { num } from "@/lib/format";
import { haptic } from "@/lib/haptics";
import { ChoiceToggle, GameError, GameLoading } from "@/features/play/kit";
import { useFantasyPool } from "../data";
import { DreamRace } from "./Dream";
import { Picker } from "./Picker";
import { Results } from "./Results";
import { fantasyStore, money, nationFlag, type Best, type Mode, type Saved } from "./shared";

const benchmarks = new Map<string, number[]>();
/** Scores of random valid teams for a challenge, computed once per session. */
const benchmarkFor = (pool: Pool, c: Challenge) => {
	let b = benchmarks.get(c.id);
	if (!b) benchmarks.set(c.id, (b = randomTeamScores(pool, c.rules, hash("fantasy-benchmark", c.id), 1500)));
	return b;
};

const MODES = [
	{ id: "daily" as const, label: "Daily challenge" },
	{ id: "free" as const, label: "Free play" },
];

export function FantasyScreen() {
	const { data: pool, error, refetch } = useFantasyPool();
	const [today] = useState(() => todayUtc());
	const [mode, setModeState] = useState<Mode>(() => (fantasyStore.read<Mode>("mode", "daily") === "free" ? "free" : "daily"));
	const challenge = useMemo((): Challenge | null => {
		if (!pool) return null;
		if (mode === "daily") return dailyChallenge(pool.data, today);
		return { id: "free", title: "Free play", description: "Any era, any team: the standard 100M budget.", rules: FREE_PLAY };
	}, [pool, today, mode]);
	const setMode = (m: Mode) => {
		setModeState(m);
		fantasyStore.write("mode", m);
	};
	const subtitle = challenge && mode === "daily" ? `Daily challenge #${(challenge as Challenge & { number: number }).number}` : mode === "free" ? "Free play" : null;

	return (
		<DetailScreen title="Fantasy" subtitle={subtitle}>
			{pool && challenge ? (
				<FantasyGame key={challenge.id} pool={pool} challenge={challenge} mode={mode} setMode={setMode} today={today} />
			) : (
				<ScrollView>
					<ReadableWidth>{error ? <GameError what="the fantasy data" onRetry={() => void refetch()} /> : <GameLoading />}</ReadableWidth>
				</ScrollView>
			)}
		</DetailScreen>
	);
}

function readSaved(pool: Pool, challenge: Challenge, saveKey: string): Saved {
	const s = fantasyStore.read<Saved>(`team:${saveKey}`, { team: EMPTY_TEAM, locked: false });
	// drop picks the current data no longer has
	const team: Team = {
		drivers: (s.team?.drivers ?? []).filter((id) => pool.ds.has(id)),
		constructor: s.team?.constructor && pool.cs.has(s.team.constructor) ? s.team.constructor : null,
		captain: s.team?.captain && pool.ds.has(s.team.captain) ? s.team.captain : null,
	};
	return { team, locked: !!s.locked && !teamIssues(pool, team, challenge.rules).length };
}

function FantasyGame({ pool, challenge, mode, setMode, today }: { pool: Pool; challenge: Challenge; mode: Mode; setMode: (m: Mode) => void; today: string }) {
	const saveKey = mode === "daily" ? challenge.id : "free";
	const [saved, setSaved] = useState<Saved>(() => readSaved(pool, challenge, saveKey));
	const [best, setBest] = useState<Best>(() => fantasyStore.read<Best>("best", {}));
	const [benchmark, setBenchmark] = useState<number[] | null>(() => benchmarks.get(challenge.id) ?? null);
	const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
	const resultsY = useRef(0);

	// the benchmark takes a moment on a phone: after the screen has settled, and only once locked in
	useEffect(() => {
		if (!saved.locked || benchmark) return;
		const t = setTimeout(() => setBenchmark(benchmarkFor(pool, challenge)), 300);
		return () => clearTimeout(t);
	}, [saved.locked, benchmark, pool, challenge]);

	const update = (next: Saved) => {
		setSaved(next);
		fantasyStore.write(`team:${saveKey}`, next);
	};
	const setTeam = (team: Team) => update({ team, locked: false });

	const lockIn = () => {
		haptic("success");
		update({ ...saved, locked: true });
		const result = scoreTeam(pool, saved.team);
		const bench = benchmarkFor(pool, challenge);
		setBenchmark(bench);
		const pct = percentile(bench, result.total);
		const prev = best[challenge.id];
		if (!prev || result.total > prev.score) {
			const next = { ...best, [challenge.id]: { score: result.total, pct, team: saved.team, date: today } };
			setBest(next);
			fantasyStore.write("best", next);
		}
		requestAnimationFrame(() => scroll.current?.scrollTo({ y: Math.max(0, resultsY.current - 8), animated: true }));
	};

	return (
		<ScrollView ref={scroll} contentContainerClassName="pb-16" keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
			<ReadableWidth>
				<View className="gap-3 px-4 pt-2">
					<ChoiceToggle value={mode} options={MODES} onChange={setMode} />
					<Text variant="muted">
						Draft five driver-seasons and a constructor-season from any year since 1950. Every pick is scored by replaying its real season with one points table
						for every era, averaged per race, so a seven-race 1950s season and a 24-race modern one count the same.
					</Text>
				</View>
				<ChallengeBlock challenge={challenge} pool={pool} mode={mode} best={best[challenge.id]} />
				<TeamSheet
					pool={pool}
					rules={challenge.rules}
					team={saved.team}
					locked={saved.locked}
					daily={mode === "daily"}
					onChange={setTeam}
					onLock={lockIn}
					onEdit={() => update({ ...saved, locked: false })}
				/>
				<View onLayout={(e) => (resultsY.current = e.nativeEvent.layout.y)}>
					{saved.locked ? <Results pool={pool} challenge={challenge} team={saved.team} benchmark={benchmark} /> : <Picker pool={pool} rules={challenge.rules} team={saved.team} onChange={setTeam} />}
				</View>
				{saved.locked ? <DreamRace pool={pool} team={saved.team} seedKey={challenge.id} /> : null}
				<Scoring />
			</ReadableWidth>
		</ScrollView>
	);
}

function ChallengeBlock({ challenge, pool, mode, best }: { challenge: Challenge; pool: Pool; mode: Mode; best?: Best[string] }) {
	const daily = challenge as Challenge & { number?: number; date?: string };
	return (
		<View className="mt-4 gap-2 border-y border-border px-4 py-4">
			<Text variant="caption">{mode === "daily" ? `Daily challenge #${daily.number} · ${daily.date}` : "Free play"}</Text>
			<Text variant="title">{challenge.title}</Text>
			<Text variant="muted">{challenge.description}</Text>
			<View className="flex-row flex-wrap gap-1.5 pt-1">
				{rulesSummary(pool.data, challenge.rules).map((r) => (
					<Badge key={r} label={r} />
				))}
			</View>
			{best ? (
				<View className="mt-1 flex-row items-center gap-3">
					<Icon icon={Trophy} tone="gold" size={20} />
					<View>
						<Text variant="caption">Your best</Text>
						<Text variant="label" className="tabular-nums">
							{num(best.score)} pts <Text variant="muted">· {rating(best.pct).label}</Text>
						</Text>
					</View>
				</View>
			) : null}
		</View>
	);
}

function TeamSheet({
	pool,
	rules,
	team,
	locked,
	daily,
	onChange,
	onLock,
	onEdit,
}: {
	pool: Pool;
	rules: Rules;
	team: Team;
	locked: boolean;
	daily: boolean;
	onChange: (t: Team) => void;
	onLock: () => void;
	onEdit: () => void;
}) {
	const { data } = pool;
	const cost = teamCost(pool, team);
	const left = rules.budget - cost;
	const issues = teamIssues(pool, team, rules);
	const pct = Math.min(100, (cost / rules.budget) * 100);
	const picks = team.drivers.map((id) => pool.ds.get(id)!).filter(Boolean);
	const c = team.constructor ? pool.cs.get(team.constructor) : null;
	const slots = Array.from({ length: rules.drivers }, (_, i) => picks[i] ?? null);

	return (
		<Section
			title="Your team"
			action={!locked && (team.drivers.length > 0 || team.constructor) ? <Button label="Clear" icon={Trash2} variant="ghost" size="sm" onPress={() => onChange(EMPTY_TEAM)} /> : null}
		>
			<View className="gap-1.5 px-4 pt-1">
				<View className="flex-row items-baseline justify-between">
					<Text variant="small" className="tabular-nums">
						<Text variant="small" className="font-semibold">
							{money(cost)}
						</Text>{" "}
						<Text variant="small" className="text-muted-foreground">
							of {money(rules.budget)}
						</Text>
					</Text>
					<Text variant="small" className={cn("font-semibold tabular-nums", left < 0 ? "text-destructive" : "text-muted-foreground")}>
						{left < 0 ? `${money(-left)} over` : `${money(left)} left`}
					</Text>
				</View>
				<View className="h-2 overflow-hidden rounded-full bg-muted" accessible accessibilityRole="progressbar" accessibilityLabel="Budget spent" accessibilityValue={{ min: 0, max: rules.budget, now: cost }}>
					<View className={cn("h-full rounded-full", left < 0 ? "bg-destructive" : pct > 90 ? "bg-gold" : "bg-primary")} style={{ width: `${pct}%` }} />
				</View>
			</View>
			<View className="mt-3 gap-1.5 px-4">
				{slots.map((s, i) =>
					s ? (
						<View key={s.id} className="min-h-12 flex-row items-center gap-2 rounded-md bg-muted/60 pl-2.5">
							<Flag code={nationFlag(pool, data.drivers[s.d][1])} />
							<View className="flex-1 py-1.5">
								<Text variant="label" numberOfLines={1}>
									{data.drivers[s.d][0]} <Text variant="muted">{s.y}</Text>
								</Text>
								<Text variant="caption" numberOfLines={1}>
									{data.teams[s.t[0]]?.[0]}
								</Text>
							</View>
							<Text variant="small" className="tabular-nums">
								{money(s.p)}
							</Text>
							<IconButton
								icon={Star}
								label={`${team.captain === s.id ? "Remove captaincy from" : "Make captain:"} ${data.drivers[s.d][0]}`}
								tone={team.captain === s.id ? "gold" : "muted"}
								size={18}
								onPress={
									locked
										? undefined
										: () => {
												haptic(team.captain === s.id ? "toggleOff" : "toggleOn");
												onChange({ ...team, captain: team.captain === s.id ? null : s.id });
											}
								}
							/>
							{!locked ? (
								<IconButton
									icon={X}
									label={`Remove ${data.drivers[s.d][0]} ${s.y}`}
									tone="muted"
									size={18}
									onPress={() => onChange({ ...team, drivers: team.drivers.filter((id) => id !== s.id), captain: team.captain === s.id ? null : team.captain })}
								/>
							) : null}
						</View>
					) : (
						<View key={`empty-${i}`} className="h-12 justify-center rounded-md border border-dashed border-border px-3">
							<Text variant="muted">Driver {i + 1}</Text>
						</View>
					),
				)}
				<Text variant="caption" className="mt-2">
					Constructor
				</Text>
				{c ? (
					<View className="min-h-12 flex-row items-center gap-2 rounded-md bg-muted/60 pl-2.5">
						<Flag code={nationFlag(pool, data.teams[c.t][1])} />
						<View className="flex-1 py-1.5">
							<Text variant="label" numberOfLines={1}>
								{data.teams[c.t][0]} <Text variant="muted">{c.y}</Text>
							</Text>
							<Text variant="caption" numberOfLines={1}>
								{c.ds.map((d) => data.drivers[d]?.[0]).join(", ")}
							</Text>
						</View>
						<Text variant="small" className={cn("tabular-nums", locked && "pr-3")}>
							{money(c.p)}
						</Text>
						{!locked ? <IconButton icon={X} label={`Remove ${data.teams[c.t][0]} ${c.y}`} tone="muted" size={18} onPress={() => onChange({ ...team, constructor: null })} /> : null}
					</View>
				) : (
					<View className="h-12 justify-center rounded-md border border-dashed border-border px-3">
						<Text variant="muted">Constructor</Text>
					</View>
				)}
			</View>
			<View className="mt-4 gap-2 px-4">
				{locked ? (
					daily ? (
						<View className="flex-row items-center gap-2">
							<Icon icon={Lock} tone="muted" size={16} />
							<Text variant="muted" className="flex-1">
								Locked in for today. A new challenge starts at midnight UTC.
							</Text>
						</View>
					) : (
						<Button label="Edit team" icon={Pencil} variant="outline" onPress={onEdit} />
					)
				) : (
					<>
						{issues.map((i) => (
							<Text key={i} variant="muted">
								{i}
							</Text>
						))}
						{!issues.length && !team.captain ? <Text variant="muted">Tip: star a captain to double their score.</Text> : null}
						<Button label="Lock in and score" icon={Lock} size="lg" disabled={issues.length > 0} onPress={onLock} />
						{daily ? <Text variant="caption">Daily teams can&apos;t be changed once locked in.</Text> : null}
					</>
				)}
			</View>
		</Section>
	);
}

const SCORING: [string, string][] = [
	["Finish", "25-18-15-12-10-8-6-4-2-1 for the top ten, in every era"],
	["Pole position", "+5"],
	["Fastest lap", "+3"],
	["Best car of the team", "+3, when the team ran more than one car"],
	["Places gained from the grid", "+1 each (up to +10), −1 each lost (down to −5), finishers only"],
	["Retirement / disqualification", "−10 / −15"],
	["Constructor", "its two best cars' finishing points and retirements, plus pole and fastest lap"],
	["Season", "average per race × 20; missed rounds count as zero. The Indianapolis 500 and sprints aren't scored"],
	["Captain", "scores double"],
];

function Scoring() {
	return (
		<Section
			title="How scoring works"
			description="Prices come from where a season finished in the championship, its share of the leader's points, wins and podiums, not from fantasy points, so some seasons are bargains."
		>
			<View className="mt-1">
				{SCORING.map(([k, v], i) => (
					<View key={k} className={cn("gap-0.5 px-4 py-2.5", i < SCORING.length - 1 && "border-b border-border")}>
						<Text variant="label">{k}</Text>
						<Text variant="muted">{v}</Text>
					</View>
				))}
			</View>
		</Section>
	);
}
