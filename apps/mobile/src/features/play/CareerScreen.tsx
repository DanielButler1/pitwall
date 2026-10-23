// "Career path" (/play/career): a mystery driver's career told team by team. The first stint
// shows from the start; each wrong guess opens the next, and wrong guesses 3, 4 and 5 open the
// nationality, the wins and podiums, and the initials. Data from core's careerFile, built on the
// device; picks, reveals, verdicts and the share text from core's game/career.

import { Check, Lock, Users, X } from "lucide-react-native";
import { useMemo } from "react";
import { View } from "react-native";
import Animated, { FadeInDown, ZoomIn } from "react-native-reanimated";
import type { Verdict } from "@pitwall/core/game/daily";
import { careerFile } from "@pitwall/core/game/career-data";
import {
	dailyTarget,
	DIFFICULTIES,
	driverWeight,
	HINT_AFTER,
	HINTS,
	judge,
	MAX_GUESSES,
	randomTarget,
	recordResult,
	revealed,
	shareText,
	span,
	unpackFile,
	type CareerDriver,
	type Difficulty,
	type GuessResult,
	type HintKey,
	type Stint,
} from "@pitwall/core/game/career";
import { Flag } from "@/components/f1";
import { Icon, Section, Text } from "@/components/ui";
import { webUrl } from "@/lib/config";
import { cn } from "@/lib/cn";
import { num, plural } from "@/lib/format";
import { href } from "@/lib/links";
import {
	ChoiceToggle,
	dbLoader,
	EntityPicker,
	Figures,
	GameError,
	GameHeader,
	GameLoading,
	GameScreen,
	LegendItem,
	ResultCard,
	shareResult,
	StatsPanel,
	useDbData,
	useGuessGame,
	VerdictBadge,
} from "./kit";
import { GuessFooter, LinkText, RevealTitle, resultStatus } from "./shared";

const load = dbLoader((db) => {
	const f = careerFile(db);
	const drivers = unpackFile(f);
	return {
		drivers,
		byId: new Map(drivers.map((d) => [d.id, d])),
		teamNames: new Map(f.teams),
		items: drivers.map((d) => ({ id: d.id, label: d.name, sublabel: span(d.first, d.last), weight: driverWeight(d) })),
	};
});

export function CareerScreen() {
	const { data, error, retry } = useDbData(load);
	const g = useGuessGame<string, Difficulty>({
		game: "career",
		variant: { key: "difficulty", ids: ["modern", "all"], fallback: "modern" },
		maxGuesses: MAX_GUESSES,
		ready: data,
		dailyTarget: (v, day) => dailyTarget(data!.drivers, v, day).id,
		randomTarget: (v, exclude) => randomTarget(data!.drivers, v, Math.random, exclude).id,
		recordResult,
	});
	const target = data && g.targetId ? (data.byId.get(g.targetId) ?? null) : null;
	const results = useMemo(
		() => (data && target ? g.guesses.map((id) => data.byId.get(id)).filter((d) => !!d).map((d) => judge(d, target)) : []),
		[data, target, g.guesses],
	);
	const level = DIFFICULTIES.find((d) => d.id === g.variant)!;
	const wrong = results.filter((r) => r.verdict !== "match").length;
	const shown = target ? revealed(target, wrong, g.over) : { stints: 0, hints: 0 };

	return (
		<GameScreen title="Career path" today={g.today} mode={g.mode} onStats={g.openStats}>
			<GameHeader mode={g.mode} onModeChange={g.setMode} controls={<ChoiceToggle value={g.variant} options={DIFFICULTIES} onChange={g.setVariant} />}>
				{`A mystery driver every day at midnight UTC, told team by team. You see where the career began; each wrong guess shows the next team, and wrong guesses 3, 4 and 5 also unlock their nationality, wins and podiums, and initials. ${MAX_GUESSES} guesses. ${level.description}.`}
			</GameHeader>

			{error ? (
				<GameError what="the drivers" onRetry={retry} />
			) : !data || !target ? (
				<GameLoading />
			) : (
				<View className="mt-2">
					{g.over ? (
						<ResultCard
							won={g.won}
							status={resultStatus(g.won, results.length, MAX_GUESSES, "Out of guesses. The mystery driver was")}
							mode={g.mode}
							nextLabel={g.mode === "practice" ? "Next practice driver" : "Practice with a random driver"}
							countdownLabel="Next career in"
							onShare={() => shareResult(shareText({ results, won: g.won, label: g.shareLabel(), url: webUrl("/play/career") }))}
							onNext={g.playAgain}
							onStats={g.openStats}
							onRollover={g.rollover}
						>
							<RevealTitle flag={target.flag} title={target.name} subtitle={`${target.nation} · ${span(target.first, target.last)} · ${target.stints.length} team stints`} href={href.driver(target.id)} />
							<Figures
								items={[
									["Starts", target.starts],
									["Wins", target.wins],
									["Podiums", target.podiums],
									["Titles", target.titles],
								]}
							/>
						</ResultCard>
					) : (
						<View className="gap-1">
							<EntityPicker items={data.items} exclude={g.guesses} onPick={(i) => g.guess(i.id)} label="Guess the driver" placeholder="Type a driver's name" noun="drivers" />
							<GuessFooter text={`Guess ${results.length + 1} of ${MAX_GUESSES}`} practice={g.mode === "practice"} newLabel="New driver" onNew={g.newPractice} />
						</View>
					)}
					<Timeline target={target} shown={shown.stints} over={g.over} />
					<Hints target={target} shown={shown.hints} wrong={g.over ? null : wrong} />
					<Guesses results={results} teamNames={data.teamNames} />
					<View className="gap-2 px-4 pt-5">
						<LegendItem verdict="match" icon={Check}>
							The mystery driver
						</LegendItem>
						<LegendItem verdict="close" icon={Users}>
							Wrong, but drove for one of the same teams
						</LegendItem>
						<LegendItem verdict="miss" icon={X}>
							No team in common
						</LegendItem>
					</View>
				</View>
			)}

			<StatsPanel
				open={g.statsOpen}
				onClose={g.closeStats}
				stats={g.stats}
				today={g.today}
				description={`Daily puzzles, ${level.label.toLowerCase()}. Saved on this device.`}
				highlight={g.highlight}
			/>
		</GameScreen>
	);
}

/* ------------------------------------------------------------- timeline --- */

function Timeline({ target, shown, over }: { target: CareerDriver; shown: number; over: boolean }) {
	const n = target.stints.length;
	return (
		<Section title="Career" description={`${n} team stints${!over && shown < n ? ` · ${n - shown} hidden` : ""}`}>
			<View className="gap-2 px-4 pt-2">
				{target.stints.map((s, i) => (
					<StintSlot key={i} n={i + 1} stint={i < shown ? s : null} over={over} first={i === 0} />
				))}
			</View>
		</Section>
	);
}

function StintSlot({ n, stint, over, first }: { n: number; stint: Stint | null; over: boolean; first: boolean }) {
	const number = (
		<View className={cn("h-8 w-8 items-center justify-center rounded-full", stint ? "bg-foreground" : "border border-border")}>
			<Text variant="caption" className={cn("font-semibold tabular-nums", stint ? "text-background" : "text-muted-foreground")}>
				{n}
			</Text>
		</View>
	);
	if (!stint) {
		return (
			<View className="flex-row items-center gap-3" accessible accessibilityLabel={`Stint ${n}: hidden team`}>
				{number}
				<View className="min-h-11 flex-1 flex-row items-center gap-2 rounded-md border border-dashed border-border px-3">
					<Icon icon={Lock} tone="muted" size={14} />
					<Text variant="muted">Hidden team</Text>
				</View>
			</View>
		);
	}
	return (
		<Animated.View entering={first ? undefined : FadeInDown.duration(400)}>
			<View className="flex-row items-center gap-3">
			{number}
			<View className="flex-1 rounded-md border border-border px-3 py-2">
				<View className="flex-row items-baseline justify-between gap-3">
					{over ? (
						<Text variant="label" numberOfLines={1} className="flex-1">
							<LinkText href={href.team(stint.team)}>{stint.teamName}</LinkText>
						</Text>
					) : (
						<Text variant="label" numberOfLines={1} className="flex-1">
							{stint.teamName}
						</Text>
					)}
					<Text variant="caption" className="tabular-nums">
						{span(stint.from, stint.to)}
					</Text>
				</View>
				{over ? (
					<Text variant="caption" className="mt-0.5 tabular-nums">
						{`${plural(stint.starts, "start")} · ${plural(stint.wins, "win")} · ${plural(stint.podiums, "podium")}`}
					</Text>
				) : null}
			</View>
			</View>
		</Animated.View>
	);
}

/* ---------------------------------------------------------------- hints --- */

function HintValue({ hint, d }: { hint: HintKey; d: CareerDriver }) {
	if (hint === "nation")
		return (
			<View className="items-center">
				<Flag code={d.flag} className="text-[18px] leading-6" />
				<Text variant="caption" numberOfLines={1} className="font-semibold text-foreground">
					{d.nation}
				</Text>
			</View>
		);
	if (hint === "results") return <Text variant="heading" className="tabular-nums">{`${num(d.wins)} · ${num(d.podiums)}`}</Text>;
	return <Text variant="heading" className="tracking-wide">{d.initials}</Text>;
}

/** The hint cards: open ones show their value, locked ones say which wrong guess opens them. */
function Hints({ target, shown, wrong }: { target: CareerDriver; shown: number; wrong: number | null }) {
	return (
		<Section title="Hints" description={`${shown} of ${HINTS.length} unlocked`}>
			<View className="flex-row gap-1.5 px-4 pt-2">
				{HINTS.map((h, i) => {
					const open = i < shown;
					const after = HINT_AFTER[i]!;
					const next = !open && wrong != null && wrong + 1 === after;
					const text = open ? (h.key === "nation" ? target.nation : h.key === "results" ? `${target.wins} wins, ${target.podiums} podiums` : target.initials) : "";
					return (
						<Animated.View key={`${h.key}${open}`} entering={open ? ZoomIn.duration(350) : undefined} style={{ flex: 1 }}>
							<View
								accessible
								accessibilityLabel={open ? `${h.label}: ${text}` : `${h.label}: locked, unlocks after wrong guess ${after}`}
								className={cn(
									"h-[76px] items-center justify-center gap-1 rounded-md px-1",
									open ? "border border-border bg-card" : next ? "border border-foreground/30 bg-muted/50" : "border border-border bg-muted/50",
								)}
							>
								<Text variant="caption" numberOfLines={1} className="text-[11px]">
									{h.label}
								</Text>
								{open ? (
									<HintValue hint={h.key} d={target} />
								) : (
									<View className="flex-row items-center gap-1">
										<Icon icon={Lock} tone="muted" size={12} />
										<Text variant="caption" className={next ? "text-foreground" : undefined}>{`After guess ${after}`}</Text>
									</View>
								)}
							</View>
						</Animated.View>
					);
				})}
			</View>
		</Section>
	);
}

/* -------------------------------------------------------------- guesses --- */

const VERDICT_ICON: Record<Verdict, typeof Check> = { match: Check, close: Users, miss: X };

function Guesses({ results, teamNames }: { results: GuessResult[]; teamNames: Map<string, string> }) {
	if (!results.length) return null;
	return (
		<Section title="Your guesses">
			<View className="px-4 pt-1">
				{results.map((r, i) => {
					const names = r.shared.map((t) => teamNames.get(t) ?? t);
					const label = r.verdict === "match" ? "Correct" : r.verdict === "close" ? "Shared team" : "No shared team";
					const hint = r.verdict === "match" ? "The mystery driver" : r.verdict === "close" ? `Both drove for ${names.join(", ")}` : "Never drove for the same team";
					return (
						<Animated.View key={r.guess.id} entering={FadeInDown.duration(300)}>
							<View className={cn("py-2", i < results.length - 1 && "border-b border-border")}>
							<View className="min-h-9 flex-row items-center gap-2.5">
								<Text variant="caption" className="w-4 tabular-nums">
									{i + 1}
								</Text>
								<Flag code={r.guess.flag} />
								<Text variant="label" numberOfLines={1} className="flex-1">
									<LinkText href={href.driver(r.guess.id)} className="text-foreground">
										{r.guess.name}
									</LinkText>
								</Text>
								<VerdictBadge verdict={r.verdict} icon={VERDICT_ICON[r.verdict]} label={label} />
							</View>
							{r.verdict === "close" ? (
								<Text variant="caption" className="pl-[26px]">
									{hint}
								</Text>
							) : null}
							</View>
						</Animated.View>
					);
				})}
			</View>
		</Section>
	);
}
