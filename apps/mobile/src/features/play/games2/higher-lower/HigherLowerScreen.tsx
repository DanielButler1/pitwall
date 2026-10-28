// "Higher or lower" (/play/higher-lower): the website's components/play/higher-lower.tsx for the
// phone. Two cards, one above the other; the hidden number counts up when it's revealed (straight
// to the number with reduced motion). Nothing on the hidden card opens a page before it's answered:
// a driver's page lists the very stats being asked.

import { ArrowDown, ArrowUp, Check, X } from "lucide-react-native";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { View } from "react-native";
import Animated, { FadeIn, FadeInDown, SlideInDown, useReducedMotion, ZoomIn } from "react-native-reanimated";
import type { GameMode } from "@pitwall/core/game/daily";
import { DAILY_ROUNDS, isCorrect, puzzleNumber, shareText, STATS, value, WIN_SCORE, type Choice, type Entity, type Round } from "@pitwall/core/game/higher-lower";
import { Flag } from "@/components/f1";
import { Button, Icon, Text } from "@/components/ui";
import { cn } from "@/lib/cn";
import { webUrl } from "@/lib/config";
import { num } from "@/lib/format";
import { haptic } from "@/lib/haptics";
import { href, useOpen } from "@/lib/links";
import { GameError, GameHeader, GameLoading, GameScreen, ResultCard, shareResult, StatsPanel, useDbData, useToday, VERDICT_STYLE } from "@/features/play/kit";
import { higherLowerLoader, type HigherLowerData } from "../data";
import { NameLink } from "../parts";
import { useHigherLower } from "./useHigherLower";

const years = (e: Entity) => (e.first === e.last ? String(e.first) : `${e.first}–${e.last}`);
const entityHref = (e: Entity) => (e.kind === "driver" ? href.driver(e.id) : href.team(e.id));

export function HigherLowerScreen() {
	const { data, error, retry } = useDbData(higherLowerLoader);
	const { today, rollover } = useToday();
	if (data) return <HigherLowerGame key={today} data={data} today={today} rollover={rollover} />;
	return (
		<GameScreen title="Higher or lower" today={today} mode="daily">
			{error ? <GameError what="the drivers" onRetry={retry} /> : <GameLoading />}
		</GameScreen>
	);
}

function HigherLowerGame({ data, today, rollover }: { data: HigherLowerData; today: number; rollover: () => void }) {
	const h = useHigherLower(data, today);
	const [statsOpen, setStatsOpen] = useState(false);
	const { mode, rounds, answers, marks, points, streak, best, over, at, round, revealing } = h;

	const answer = (c: Choice) => {
		const ok = h.answer(c);
		if (ok != null) haptic(ok ? "success" : "error");
	};

	const share = () => {
		const url = webUrl("/play/higher-lower");
		if (mode === "daily") void shareResult(shareText({ marks, label: `#${puzzleNumber(today)}`, tail: `${points}/${DAILY_ROUNDS}`, url }));
		else void shareResult(shareText({ marks: marks.length <= 20 ? marks : [], label: "endless", tail: `streak ${streak}`, url }));
	};

	return (
		<GameScreen title="Higher or lower" today={today} mode={mode} practiceLabel="Endless" onStats={() => setStatsOpen(true)}>
			<GameHeader mode={mode} onModeChange={h.setMode} practiceLabel="Endless">
				<Text variant="muted">
					Does the next driver or constructor have more? Career wins, poles, starts, podiums or laps led, one stat a round; ties count as right. Daily is ten
					rounds, the same for everyone, new at midnight UTC. Endless keeps going until your first miss.
				</Text>
			</GameHeader>

			{!rounds || !round ? (
				<GameLoading />
			) : over ? (
				<ResultCard
					won={mode === "daily" ? points >= WIN_SCORE : streak > 0 && streak >= best}
					status={
						mode === "daily"
							? `${points === DAILY_ROUNDS ? "Perfect! " : ""}You scored ${points} out of ${DAILY_ROUNDS}.`
							: streak >= best && streak > 0
								? `New best: a streak of ${streak}.`
								: `Streak over at ${streak}. Your best is ${best}.`
					}
					mode={mode}
					nextLabel={mode === "daily" ? "Play endless" : "Play again"}
					countdownLabel="Next run in"
					onShare={share}
					onStats={() => setStatsOpen(true)}
					onNext={h.playEndless}
					onRollover={rollover}
				>
					<Summary rounds={rounds.slice(0, answers.length)} answers={answers} />
				</ResultCard>
			) : (
				<View className="gap-4 pt-3">
					<Progress mode={mode} marks={marks} at={at} revealing={revealing != null} streak={streak} best={best} />
					<View className="gap-1 px-4">
						<Text variant="title" className="text-center">
							{STATS[round.stat].question[round.left.kind]}
						</Text>
						<Text variant="muted" className="text-center">
							Does <Text variant="muted" className="font-semibold text-foreground">{round.right.name}</Text> have more {STATS[round.stat].unit[1]} than {round.left.name}?
							{round.stat === "lapsLed" ? ` Laps led are counted since ${data.lapsFrom}.` : ""}
						</Text>
					</View>
					<Duel key={`${mode}:${at}`} round={round} carried={at > 0 && rounds[at - 1].right.id === round.left.id} reveal={revealing === at} choice={answers[at]} onAnswer={answer} />
				</View>
			)}

			<StatsPanel
				open={statsOpen}
				onClose={() => setStatsOpen(false)}
				stats={h.stats}
				today={today}
				description={`Daily runs of ${DAILY_ROUNDS}; ${WIN_SCORE} or more counts as a win. Best endless streak: ${best}. Saved on this phone.`}
				distributionTitle="Score distribution"
				distributionLabel="Daily runs by score"
				bucketLabel={(i) => String(i)}
				bucketSrLabel={(i) => `runs scoring ${i}`}
				labelWidth={18}
				highlight={mode === "daily" && over ? points : null}
			/>
		</GameScreen>
	);
}

/* ------------------------------------------------------------- progress --- */

function Progress({ mode, marks, at, revealing, streak, best }: { mode: GameMode; marks: boolean[]; at: number; revealing: boolean; streak: number; best: number }) {
	if (mode === "practice")
		return (
			<View className="flex-row justify-center gap-6">
				<Text variant="muted">
					Streak <Text variant="muted" className="font-semibold text-foreground tabular-nums">{streak}</Text>
				</Text>
				<Text variant="muted">
					Best <Text variant="muted" className="font-semibold text-foreground tabular-nums">{Math.max(best, streak)}</Text>
				</Text>
			</View>
		);
	const shown = revealing ? marks : marks.slice(0, at);
	return (
		<View className="items-center gap-2">
			<View className="flex-row gap-1" accessible accessibilityLabel={`Round ${at + 1} of ${DAILY_ROUNDS}, score ${shown.filter(Boolean).length}`}>
				{Array.from({ length: DAILY_ROUNDS }, (_, i) => {
					const m = shown[i];
					return (
						<View
							key={i}
							className={cn("h-7 w-7 items-center justify-center rounded-md", m === true ? VERDICT_STYLE.match.box : m === false ? "bg-destructive" : i === at ? "border-2 border-foreground/40" : "bg-muted")}
						>
							{m === true ? <Check color="#ffffff" size={14} strokeWidth={3} /> : m === false ? <X color="#ffffff" size={14} strokeWidth={3} /> : null}
						</View>
					);
				})}
			</View>
			<Text variant="caption">
				Round {Math.min(at + 1, DAILY_ROUNDS)} of {DAILY_ROUNDS} · Score <Text variant="caption" className="font-semibold text-foreground tabular-nums">{shown.filter(Boolean).length}</Text>
			</Text>
		</View>
	);
}

/* ---------------------------------------------------------------- cards --- */

/** Counts up to `target` over 700 ms with an ease-out, or shows it at once with reduced motion. */
function useCountUp(target: number, run: boolean, reduced: boolean) {
	const animate = run && !reduced;
	const [n, setN] = useState(0);
	const frame = useRef(0);
	useEffect(() => {
		if (!animate) return;
		const start = Date.now();
		const tick = () => {
			const p = Math.min(1, (Date.now() - start) / 700);
			setN(Math.round(target * (1 - (1 - p) ** 3)));
			if (p < 1) frame.current = requestAnimationFrame(tick);
		};
		frame.current = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(frame.current);
	}, [target, animate]);
	return animate ? n : target;
}

function Duel({ round, carried, reveal, choice, onAnswer }: { round: Round; carried: boolean; reveal: boolean; choice?: Choice; onAnswer: (c: Choice) => void }) {
	const reduced = useReducedMotion();
	const correct = reveal && choice ? isCorrect(round, choice) : null;
	return (
		<View className="gap-2 px-4">
			<Animated.View entering={reduced ? undefined : carried ? SlideInDown.duration(400) : FadeIn.duration(400)}>
				<EntityCard entity={round.left} linked>
					<StatValue value={value(round.left, round.stat) ?? 0} stat={round.stat} />
				</EntityCard>
			</Animated.View>
			<View className="items-center" importantForAccessibility="no-hide-descendants">
				<View className="-my-5 z-10 h-9 w-9 items-center justify-center rounded-full border border-border bg-background">
					<Text variant="caption" className="font-semibold">
						vs
					</Text>
				</View>
			</View>
			<Animated.View entering={reduced ? undefined : FadeInDown.delay(150).duration(400)}>
				<EntityCard entity={round.right} linked={reveal} ring={correct === true ? "border-2 border-success" : correct === false ? "border-2 border-destructive" : undefined}>
					{reveal ? (
						<Animated.View entering={reduced ? undefined : ZoomIn.duration(300)} className="items-center gap-1" accessibilityLiveRegion="polite">
							<StatValue value={value(round.right, round.stat) ?? 0} stat={round.stat} animate reduced={!!reduced} />
							<View className="flex-row items-center gap-1">
								<Icon icon={correct ? Check : X} tone={correct ? "success" : "destructive"} size={16} strokeWidth={2.5} />
								<Text variant="label" className={correct ? "text-success" : "text-destructive"}>
									{correct ? "Right" : "Wrong"}
								</Text>
							</View>
						</Animated.View>
					) : (
						<View className="w-full flex-row gap-2">
							<Button label="Higher" icon={ArrowUp} size="lg" className="flex-1" onPress={() => onAnswer("higher")} />
							<Button label="Lower" icon={ArrowDown} size="lg" variant="outline" className="flex-1" onPress={() => onAnswer("lower")} />
						</View>
					)}
				</EntityCard>
			</Animated.View>
		</View>
	);
}

function StatValue({ value: v, stat, animate = false, reduced = false }: { value: number; stat: Round["stat"]; animate?: boolean; reduced?: boolean }) {
	const n = useCountUp(v, animate, reduced);
	return (
		<View className="items-center">
			<Text className="text-[40px] leading-[46px] font-bold tracking-tight text-foreground tabular-nums" accessibilityLabel={`${num(v)} ${STATS[stat].unit[v === 1 ? 0 : 1]}`}>
				{num(n)}
			</Text>
			<Text variant="caption">{STATS[stat].unit[v === 1 ? 0 : 1]}</Text>
		</View>
	);
}

/** One side of the duel. The name only opens its page once this side's value is showing. */
function EntityCard({ entity: e, linked, ring, children }: { entity: Entity; linked: boolean; ring?: string; children: ReactNode }) {
	const open = useOpen();
	const context = [years(e), e.kind === "driver" ? e.context : e.titles ? `${e.titles} ${e.titles === 1 ? "title" : "titles"}` : ""].filter(Boolean);
	return (
		<View className={cn("min-h-44 items-center justify-between gap-4 rounded-md border border-border bg-card px-4 py-5", ring)}>
			<View className="w-full items-center gap-1">
				<Text variant="caption">{e.kind === "driver" ? "Driver" : "Constructor"}</Text>
				<View className="max-w-full flex-row items-center gap-2">
					<Flag code={e.flag} className="text-[18px]" />
					<NameLink onPress={linked ? () => open(entityHref(e)) : undefined} className="text-[19px] leading-6">
						{e.name}
					</NameLink>
				</View>
				<Text variant="caption" numberOfLines={1}>
					{context.join(" · ")}
				</Text>
			</View>
			{children}
		</View>
	);
}

/* -------------------------------------------------------------- summary --- */

function Summary({ rounds, answers }: { rounds: Round[]; answers: Choice[] }) {
	const open = useOpen();
	return (
		<View className="gap-2" accessibilityLabel="Your answers">
			{rounds.map((r, i) => {
				const ok = isCorrect(r, answers[i]);
				const a = value(r.left, r.stat) ?? 0;
				const b = value(r.right, r.stat) ?? 0;
				return (
					<View key={i} className="flex-row items-start gap-2">
						<View className={cn("mt-0.5 h-5 w-5 items-center justify-center rounded", ok ? VERDICT_STYLE.match.box : "bg-destructive")}>
							{ok ? <Check color="#ffffff" size={12} strokeWidth={3} /> : <X color="#ffffff" size={12} strokeWidth={3} />}
						</View>
						<Text variant="caption" className="mt-0.5 w-16">
							{STATS[r.stat].label}
						</Text>
						<Text variant="small" className="flex-1">
							<Text variant="small" className="text-link" onPress={() => open(entityHref(r.left))} accessibilityRole="link">
								{r.left.name}
							</Text>{" "}
							<Text variant="small" className="tabular-nums">{num(a)}</Text>
							<Text variant="small" className="text-muted-foreground"> vs </Text>
							<Text variant="small" className="text-link" onPress={() => open(entityHref(r.right))} accessibilityRole="link">
								{r.right.name}
							</Text>{" "}
							<Text variant="small" className="font-bold tabular-nums">{num(b)}</Text>
						</Text>
					</View>
				);
			})}
		</View>
	);
}
