// The home page's current-season sections: standings, the latest race, the next race and the title fight.

import type { HomeResult, HomeView, TitleFight } from "@pitwall/core/f1/views";
import type { RaceFact } from "@pitwall/core/f1/race-facts";
import { FactList } from "@/components/facts";
import { ArrowDown, ArrowUp, CalendarDays, Medal, Timer, Trophy, Zap } from "lucide-react-native";
import { memo, useState } from "react";
import { View } from "react-native";
import { Flag, Pos } from "@/components/f1";
import { Badge, Icon, Row, Section, Segmented, Text } from "@/components/ui";
import { cn } from "@/lib/cn";
import { fmtDate, num, plural } from "@/lib/format";
import { haptic } from "@/lib/haptics";
import { href } from "@/lib/links";
import { InlineLink, MoreLink } from "./kit";

type Go = (path: string) => void;

/* ------------------------------------------------------------ standings --- */

export const Standings = memo(function Standings({ view, go }: { view: HomeView; go: Go }) {
	const [tab, setTab] = useState<"drivers" | "constructors">("drivers");
	return (
		<Section
			title={`${view.lastYear} standings`}
			description={view.inProgress ? `After ${view.completedRounds} of ${view.totalRounds} rounds` : "Final standings"}
			action={<MoreLink label="Full season" onPress={() => go(href.season(view.lastYear))} />}
		>
			<Segmented
				className="mx-4 mb-1 mt-2"
				value={tab}
				onChange={(next) => {
					if (next !== tab) haptic("selection");
					setTab(next);
				}}
				options={[
					{ value: "drivers", label: "Drivers" },
					{ value: "constructors", label: "Constructors" },
				]}
			/>
			{tab === "drivers"
				? view.standings.map((s, i, all) => (
						<Row
							key={s.driver.id}
							leading={<Pos text={s.position} />}
							title={s.driver.name}
							subtitle={s.teams.map((t) => t.name).join(" / ")}
							trailing={<Points value={s.points} />}
							onPress={() => go(href.driver(s.driver.id))}
							last={i === all.length - 1}
						/>
					))
				: view.constructorStandings.map((s, i, all) => (
						<Row
							key={s.team.id}
							leading={<Pos text={s.position} />}
							title={s.team.name}
							subtitle={[s.engine?.name, s.wins > 0 ? plural(s.wins, "win") : null].filter(Boolean).join(" · ") || null}
							trailing={<Points value={s.points} />}
							onPress={() => go(href.team(s.team.id))}
							last={i === all.length - 1}
						/>
					))}
		</Section>
	);
});

function Points({ value }: { value: number }) {
	return (
		<Text variant="label" className="tabular-nums">
			{num(value)}
		</Text>
	);
}

/* ---------------------------------------------------------- latest race --- */

export const LatestRace = memo(function LatestRace({ race: r, go }: { race: NonNullable<HomeView["latestRace"]>; go: Go }) {
	return (
		<Section title="Latest race" description={`${r.race.year} ${r.race.name} · ${fmtDate(r.race.date)}`} action={<MoreLink label="Full result" onPress={() => go(href.race(r.race))} />}>
			{r.top.map((x, i, all) => (
				<Row
					key={x.driver.id}
					leading={<Pos text={x.position} />}
					title={x.driver.name}
					subtitle={x.team.name}
					trailing={<ResultFigures result={x} />}
					onPress={() => go(href.driver(x.driver.id))}
					last={i === all.length - 1 && !r.pole && !r.fastestLap}
				/>
			))}
			{r.pole ? <Row icon={Zap} title={r.pole.name} subtitle="Pole position" trailing={<Flag code={r.pole.country} />} onPress={() => go(href.driver(r.pole!.id))} last={!r.fastestLap} /> : null}
			{r.fastestLap ? (
				<Row icon={Timer} title={r.fastestLap.driver.name} subtitle="Fastest lap" value={r.fastestLap.time} onPress={() => go(href.driver(r.fastestLap!.driver.id))} last />
			) : null}
		</Section>
	);
});

/** Gap and points on the right, with places gained or lost from the grid beside them. */
function ResultFigures({ result: x }: { result: HomeResult }) {
	return (
		<View className="flex-row items-center gap-3">
			<Moved result={x} />
			<View className="min-w-16 items-end">
				<Text variant="small" className="tabular-nums" numberOfLines={1}>
					{x.time ?? ""}
				</Text>
				{x.points ? (
					<Text variant="caption" className="tabular-nums">
						+{num(x.points)} pts
					</Text>
				) : null}
			</View>
		</View>
	);
}

/** Places gained or lost from the grid ("PL": started from the pit lane). */
function Moved({ result: x }: { result: HomeResult }) {
	const pos = Number(x.position);
	if (x.grid == null) return <Text variant="caption" accessibilityLabel="Started from the pit lane">PL</Text>;
	const d = x.grid - pos;
	if (!d || !Number.isFinite(d)) return <Text variant="caption" className="w-8 text-center opacity-60">–</Text>;
	const up = d > 0;
	return (
		<View className="w-8 flex-row items-center justify-end gap-0.5" accessibilityLabel={`${up ? "Gained" : "Lost"} ${plural(Math.abs(d), "place")}, started ${x.grid}`}>
			<Icon icon={up ? ArrowUp : ArrowDown} tone={up ? "success" : "destructive"} size={12} strokeWidth={2.4} />
			<Text variant="caption" className={cn("font-semibold tabular-nums", up ? "text-success" : "text-destructive")}>
				{Math.abs(d)}
			</Text>
		</View>
	);
}

/* ------------------------------------------------------------ next race --- */

/** "today", "tomorrow", "in 3 days" (by the phone's calendar); nothing once it's past. */
function daysUntil(date: string): string | null {
	const now = new Date();
	const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
	const days = Math.round((Date.parse(`${date}T00:00:00Z`) - today) / 86_400_000);
	if (days < 0) return null;
	return days === 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`;
}

export const NextRace = memo(function NextRace({ next, go, facts }: { next: NonNullable<HomeView["nextRace"]>; go: Go; facts?: RaceFact[] | null }) {
	const until = daysUntil(next.race.date);
	return (
		<Section title="Next race" action={<MoreLink label="Grand Prix history" onPress={() => go(href.grandPrix(next.grandPrix.id))} />}>
			<Row
				leading={<Flag code={next.race.country} className="text-[22px]" />}
				title={`${next.race.year} ${next.race.name}`}
				subtitle={`${next.circuit.name}, ${next.circuit.place}`}
				onPress={() => go(href.race(next.race))}
			/>
			{facts?.length ? (
				<View className="border-b border-border pb-1">
					<Text variant="caption" className="px-4 pt-3">
						What&apos;s at stake
					</Text>
					<FactList facts={facts} />
				</View>
			) : null}
			<View className="pl-4">
				<View className="flex-row flex-wrap items-center gap-x-2 gap-y-1.5 border-b border-border py-3 pr-4">
					<Icon icon={CalendarDays} tone="muted" size={15} />
					<Text variant="small">
						{fmtDate(next.race.date)}
						{until ? <Text variant="small" className="font-semibold">{` ${until}`}</Text> : null}
					</Text>
					<Text variant="caption">
						Round {next.round} of {next.of}
					</Text>
					{next.sprint ? <Badge label="Sprint weekend" /> : null}
				</View>
			</View>
			{next.lastWinner ? (
				<Row title={next.lastWinner.driver.name} subtitle={`Last winner here, ${next.lastWinner.team.name}`} value={String(next.lastWinner.year)} onPress={() => go(href.driver(next.lastWinner!.driver.id))} />
			) : null}
			{next.mostWins ? <Row title={next.mostWins.driver.name} subtitle="Most wins here" value={plural(next.mostWins.wins, "win")} onPress={() => go(href.driver(next.mostWins!.driver.id))} /> : null}
			<Text variant="caption" className="px-4 pt-2">
				{next.editions ? `Held ${plural(next.editions, "time")} before in the championship` : "A new Grand Prix"}
			</Text>
		</Section>
	);
});

/* ---------------------------------------------------------- title fight --- */

const pts = (n: number) => plural(n, "point");
/** Contender lists longer than this are early-season noise: the card shows the winners so far instead. */
const CONTENDERS_SHOWN = 6;

/** "It could be settled at the next race…", when it could. */
function clinch<R>(f: TitleFight<R>, name: (r: R) => string): string | null {
	if (f.clinchMargin == null || !f.second) return null;
	return f.clinchMargin === 0
		? "It could be settled at the next race."
		: `It could be settled at the next race: ${name(f.leader)} needs to outscore ${name(f.second)} by ${pts(f.clinchMargin)} (and the rest by less).`;
}

export const TitleFightSection = memo(function TitleFightSection({ fight: f, year, go }: { fight: NonNullable<HomeView["titleFight"]>; year: number; go: Go }) {
	const d = f.drivers;
	const c = f.constructors;
	const decided = d.contenders.length === 1;
	const early = d.contenders.length > CONTENDERS_SHOWN;
	const left = `${plural(f.roundsLeft, "round")}${f.sprintsLeft ? ` (${f.sprintsLeft} with a sprint)` : ""}`;
	const driverClinch = clinch(d, (r) => r.name);
	const teamClinch = c ? clinch(c, (r) => r.name) : null;
	return (
		<Section title="Title fight" action={<MoreLink label="Season" onPress={() => go(href.season(year))} />}>
			<Text variant="body" className="px-4 pt-1">
				{decided ? (
					<>
						<InlineLink strong onPress={() => go(href.driver(d.leader.id))}>{d.leader.name}</InlineLink> is the {year} champion, with {left} still to run.
					</>
				) : (
					<>
						<InlineLink strong onPress={() => go(href.driver(d.leader.id))}>{d.leader.name}</InlineLink> leads
						{d.second ? (
							<>
								{" "}
								<InlineLink strong onPress={() => go(href.driver(d.second!.id))}>{d.second.name}</InlineLink>
							</>
						) : null}{" "}
						by {pts(d.gap)}, with {left} and up to {pts(d.pointsLeft)} still to play for.
						{driverClinch ? <Text variant="body" className="text-muted-foreground">{` ${driverClinch}`}</Text> : null}
					</>
				)}
			</Text>
			{!decided ? (
				<View className="mt-2">
					{early ? (
						<>
							<Text variant="caption" className="px-4 pb-1">
								{d.contenders.length} drivers can still win it. {f.winners.length === 1 ? "One winner" : `${f.winners.length} different winners`} so far:
							</Text>
							{f.winners.slice(0, CONTENDERS_SHOWN).map((w, i, all) => (
								<Row
									key={w.driver.id}
									leading={<Icon icon={Trophy} tone={i === 0 ? "gold" : "muted"} size={16} />}
									title={w.driver.name}
									value={plural(w.wins, "win")}
									onPress={() => go(href.driver(w.driver.id))}
									last={i === all.length - 1}
								/>
							))}
						</>
					) : (
						<>
							<Text variant="caption" className="px-4 pb-1">
								{d.contenders.length} drivers can still win it
							</Text>
							{d.contenders.map((x, i, all) => (
								<Row
									key={x.who.id}
									leading={<Icon icon={Medal} tone={i === 0 ? "gold" : "muted"} size={16} />}
									title={x.who.name}
									value={i === 0 ? `${num(x.points)} pts` : `−${num(x.behind)}`}
									onPress={() => go(href.driver(x.who.id))}
									last={i === all.length - 1}
								/>
							))}
						</>
					)}
				</View>
			) : null}
			{c ? (
				<Text variant="small" className="mt-3 px-4 leading-5 text-muted-foreground">
					<Text variant="small" className="font-semibold">Constructors: </Text>
					{c.contenders.length === 1 ? (
						<>
							<InlineLink onPress={() => go(href.team(c.leader.id))}>{c.leader.name}</InlineLink> have won the title.
						</>
					) : (
						<>
							<InlineLink onPress={() => go(href.team(c.leader.id))}>{c.leader.name}</InlineLink> lead
							{c.second ? (
								<>
									{" "}
									<InlineLink onPress={() => go(href.team(c.second!.id))}>{c.second.name}</InlineLink>
								</>
							) : null}{" "}
							by {pts(c.gap)}; {c.contenders.length > CONTENDERS_SHOWN ? "most teams" : `${c.contenders.length} teams`} can still win it.
							{teamClinch ? ` ${teamClinch}` : null}
						</>
					)}
				</Text>
			) : null}
		</Section>
	);
});
