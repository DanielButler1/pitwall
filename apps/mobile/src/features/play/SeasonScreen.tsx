// "Guess the season" (/play/season): a mystery championship season, one clue at the start and
// another after every wrong guess. Guesses are years, from a list that never shows the champion.
// Seasons come from core's seasonFile built on the device; picks, comparisons, clues and the
// share text from core's game/season-guess.

import {
	ArrowDown,
	ArrowUp,
	CalendarDays,
	ChevronsDown,
	ChevronsUp,
	Crown,
	Factory,
	Flag as FlagIcon,
	Lock,
	Repeat,
	Sigma,
	Swords,
	Users,
	type LucideIcon,
} from "lucide-react-native";
import { useMemo, type ReactNode } from "react";
import { View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { seasonFile } from "@pitwall/core/game/season-guess-data";
import {
	compareSeasons,
	dailySeason,
	MAX_GUESSES,
	ordinal,
	poolSeasons,
	randomSeason,
	recordResult,
	round2,
	SEASON_POOLS,
	SEASON_TILES,
	seasonClues,
	seasonShareText,
	searchSeasons,
	unpackSeasons,
	type SeasonClue,
	type SeasonPool,
	type SeasonTile,
	type SgNotable,
	type SgRef,
	type SgSeason,
} from "@pitwall/core/game/season-guess";
import { Flag } from "@/components/f1";
import { Icon, Section, Text } from "@/components/ui";
import { cn } from "@/lib/cn";
import { webUrl } from "@/lib/config";
import { num, plural } from "@/lib/format";
import { href, useOpen } from "@/lib/links";
import {
	ChoiceToggle,
	ClueHeader,
	ClueRow,
	dbLoader,
	EntityPicker,
	Figures,
	GameError,
	GameHeader,
	GameLoading,
	GameScreen,
	Legend,
	ResultCard,
	shareResult,
	StatsPanel,
	TileText,
	useDbData,
	useGuessGame,
	verdictIcon,
	type ClueTileData,
	type PickerItem,
} from "./kit";
import { Detail, GuessFooter, LinkText, RevealTitle, resultStatus } from "./shared";

const load = dbLoader((db) => unpackSeasons(seasonFile(db)));

const pts = (n: number) => `${num(n)} ${n === 1 ? "point" : "points"}`;
/** "Ayrton Senna" → "Senna" for tight tiles. */
const surname = (name: string) => name.split(" ").at(-1) ?? name;

type SeasonItem = PickerItem & { season: SgSeason };

export function SeasonScreen() {
	const open = useOpen();
	const { data, error, retry } = useDbData(load);
	const g = useGuessGame<string, SeasonPool>({
		game: "season",
		variant: { key: "pool", ids: ["modern", "all"], fallback: "modern" },
		maxGuesses: MAX_GUESSES,
		ready: data,
		dailyTarget: (v, day) => dailySeason(data!.seasons, v, day).id,
		randomTarget: (v, exclude) => randomSeason(data!.seasons, v, Math.random, exclude).id,
		recordResult,
	});
	const target = data && g.targetId ? (data.byId.get(g.targetId) ?? null) : null;
	const choices = useMemo(() => (data ? poolSeasons(data.seasons, g.variant) : []), [data, g.variant]);
	const items = useMemo<SeasonItem[]>(() => choices.map((s) => ({ id: s.id, label: String(s.year), season: s })), [choices]);
	const rows = useMemo(
		() => (data && target ? g.guesses.map((id) => data.byId.get(id)).filter((s) => !!s).map((s) => compareSeasons(s, target)) : []),
		[data, target, g.guesses],
	);
	const level = SEASON_POOLS.find((p) => p.id === g.variant)!;

	return (
		<GameScreen title="Guess the season" today={g.today} mode={g.mode} onStats={g.openStats}>
			<GameHeader mode={g.mode} onModeChange={g.setMode} controls={<ChoiceToggle value={g.variant} options={SEASON_POOLS} onChange={g.setVariant} />}>
				{`A new mystery championship season every day at midnight UTC, the same for everyone. You start with one clue; every wrong guess reveals another, and each guess shows how close it was on year, champion, rounds and constructors' champion. ${MAX_GUESSES} guesses. ${level.description}.`}
			</GameHeader>

			{error ? (
				<GameError what="the seasons" onRetry={retry} />
			) : !data || !target ? (
				<GameLoading />
			) : (
				<View className="mt-2">
					{g.over ? (
						<ResultCard
							won={g.won}
							status={resultStatus(g.won, rows.length, MAX_GUESSES, "Out of guesses. The mystery season was", "From the calendar alone! Got it in 1.")}
							mode={g.mode}
							nextLabel={g.mode === "practice" ? "Next practice season" : "Practice with a random season"}
							countdownLabel="Next season in"
							onShare={() => shareResult(seasonShareText({ rows, won: g.won, label: g.shareLabel(), url: webUrl("/play/season") }))}
							onNext={g.playAgain}
							onStats={g.openStats}
							onRollover={g.rollover}
						>
							<Reveal season={target} />
						</ResultCard>
					) : (
						<>
							<Clues season={target} revealed={rows.length + 1} />
							<View className="mt-4 gap-1">
								<EntityPicker
									items={items}
									exclude={g.guesses}
									onPick={(i) => g.guess(i.id)}
									label="Guess a season"
									placeholder={`Type a year, ${choices[0]?.year}–${choices.at(-1)?.year}`}
									noun="seasons"
									search={(list, q, ex) => {
										const byId = new Map(list.map((i) => [i.id, i]));
										return searchSeasons(choices, q, ex).map((s) => byId.get(s.id)!).filter(Boolean);
									}}
									showAllOnFocus
									keyboardType="number-pad"
									maxLength={5}
									sanitize={(t) => t.replace(/[^\d']/g, "")}
								/>
								<GuessFooter text={`Guess ${rows.length + 1} of ${MAX_GUESSES} · try “1988”, “88” or “199”`} practice={g.mode === "practice"} newLabel="New season" onNew={g.newPractice} />
							</View>
						</>
					)}
					{rows.length ? (
						<View className="mt-2" accessibilityLabel="Your guesses">
							<ClueHeader labels={SEASON_TILES.map((a) => a.short)} />
							{[...rows].reverse().map((r, i) => (
								<ClueRow
									key={r.guess.id}
									n={rows.length - i}
									title={`${r.guess.year} season`}
									onPressTitle={() => open(href.season(r.guess.year))}
									tiles={r.tiles.map((t) => tileData(t, r.guess))}
								/>
							))}
						</View>
					) : null}
					<Legend
						close="Close: within 2 years or 2 rounds, or a champion from the same team"
						direction="The mystery season is later or has more rounds (double arrow: 10 or more years)"
					/>
				</View>
			)}

			<StatsPanel
				open={g.statsOpen}
				onClose={g.closeStats}
				stats={g.stats}
				today={g.today}
				description={`Daily puzzles, ${level.label.toLowerCase()} seasons. Saved on this device.`}
				highlight={g.highlight}
			/>
		</GameScreen>
	);
}

/* ---------------------------------------------------------------- clues --- */

const CLUE_LABEL: Record<SeasonClue["kind"], { label: string; icon: LucideIcon }> = {
	calendar: { label: "The calendar", icon: CalendarDays },
	flags: { label: "Champion's flags", icon: FlagIcon },
	numbers: { label: "Champion's season", icon: Sigma },
	changes: { label: "Comings and goings", icon: Repeat },
	rivals: { label: "The rivals", icon: Swords },
	champion: { label: "The champion", icon: Crown },
};

/** "a 7-time world champion", "41 Grand Prix wins in all", "a podium regular". */
const record = (n: SgNotable) => (n.titles ? `${n.titles === 1 ? "a" : `a ${n.titles}-time`} world champion` : n.wins ? `${plural(n.wins, "Grand Prix win")} in all` : "a podium regular");

function Line({ label, children }: { label: string; children: ReactNode }) {
	return (
		<View className="gap-0.5">
			<Text variant="caption">{label}</Text>
			<View className="flex-row flex-wrap items-center gap-x-2 gap-y-0.5">{children}</View>
		</View>
	);
}

function Named({ who, extra }: { who: SgRef; extra?: string }) {
	return (
		<>
			<View className="flex-row items-center gap-1.5">
				<Flag code={who.flag} />
				<Text variant="label">{who.name}</Text>
			</View>
			{extra ? <Text variant="caption">{extra}</Text> : null}
		</>
	);
}

function ClueBody({ clue: c }: { clue: SeasonClue }) {
	switch (c.kind) {
		case "calendar":
			return (
				<View className="gap-1">
					<Text variant="label">{`${plural(c.rounds, "round")}${c.sprints > 0 ? ` · ${plural(c.sprints, "sprint")}` : ""} · ${plural(c.winners, "different winner")}`}</Text>
					<Text variant="muted">
						{c.ledRounds === c.rounds
							? "The champion led the standings from the first round to the last."
							: c.leadFrom >= c.rounds
								? `The champion only took the lead for good after the final round, having led after ${plural(c.ledRounds, "round")}.`
								: `The champion led the standings after ${c.ledRounds} of ${c.rounds} rounds, and for good from round ${c.leadFrom}.`}
					</Text>
				</View>
			);
		case "flags":
			return (
				<View className="flex-row flex-wrap gap-x-6 gap-y-2">
					{[
						[c.driver, "Champion from"],
						[c.team, "Driving for a team from"],
					].map(([who, label]) => (
						<View key={label as string} className="flex-row items-center gap-2">
							<Flag code={(who as SgRef).flag} className="text-[18px] leading-6" />
							<View>
								<Text variant="caption">{label as string}</Text>
								<Text variant="label">{(who as SgRef).countryName}</Text>
							</View>
						</View>
					))}
				</View>
			);
		case "numbers":
			return (
				<Figures
					items={[
						["Points", num(c.points)],
						["Wins", `${c.wins} of ${c.rounds}`],
						["Podiums", c.podiums],
						["Poles", c.poles],
						["Title margin", pts(c.margin)],
					]}
				/>
			);
		case "changes": {
			const shown = c.circuits.slice(0, 4);
			// a calendar of nothing but new circuits can only be the first season: leave it out
			const giveaway = c.circuits.length >= 6;
			return (
				<View className="gap-2">
					{!giveaway ? (
						<Line label={c.circuits.length === 1 ? "New circuit" : "New circuits"}>
							{shown.length ? (
								<>
									{shown.map((ci) => (
										<View key={ci.id} className="flex-row items-center gap-1.5">
											<Flag code={ci.flag} />
											<Text variant="label">{ci.name}</Text>
										</View>
									))}
									{c.circuits.length > shown.length ? <Text variant="caption">{`and ${c.circuits.length - shown.length} more`}</Text> : null}
								</>
							) : (
								<Text variant="muted">None: every circuit had raced before</Text>
							)}
						</Line>
					) : null}
					<Line label="Debut">{c.debut ? <Named who={c.debut.driver} extra={`later ${record(c.debut)}`} /> : <Text variant="muted">No future race winner made a debut</Text>}</Line>
					<Line label="Final season">{c.farewell ? <Named who={c.farewell.driver} extra={record(c.farewell)} /> : <Text variant="muted">No race winner bowed out</Text>}</Line>
				</View>
			);
		}
		case "rivals":
			return (
				<View className="gap-2">
					<Line label="Constructors' champion">
						{c.constructors ? (
							<Named who={c.constructors} />
						) : (
							<>
								<Text variant="muted">None yet (from 1958). The champion drove for</Text>
								<Named who={c.championTeam} />
							</>
						)}
					</Line>
					<Line label="Runner-up">
						<Named who={c.runnerUp.driver} extra={`${c.runnerUp.team.name}, ${pts(c.runnerUp.points)}`} />
					</Line>
				</View>
			);
		case "champion":
			return (
				<View className="flex-row flex-wrap items-center gap-x-2">
					<Named who={c.driver} extra={`${c.team.name} · ${c.title === 1 ? "his first title" : `his ${ordinal(c.title)} title`}`} />
				</View>
			);
	}
}

function Clues({ season, revealed }: { season: SgSeason; revealed: number }) {
	const clues = useMemo(() => seasonClues(season), [season]);
	return (
		<Section title="Clues" description={`${Math.min(revealed, clues.length)} of ${clues.length} revealed`} className="mt-3">
			<View className="px-4">
				{clues.map((c, i) => {
					const { label, icon } = CLUE_LABEL[c.kind];
					const open = i < revealed;
					const body = (
						<View className={cn("gap-1.5 py-3", i < clues.length - 1 && "border-b border-border")}>
							<View className="flex-row items-center gap-1.5">
								<Icon icon={icon} tone={open ? "foreground" : "muted"} size={14} />
								<Text variant="caption" className={cn("font-semibold", open && "text-foreground")}>
									{label}
								</Text>
							</View>
							{open ? (
								<ClueBody clue={c} />
							) : (
								<View className="flex-row items-center gap-1.5">
									<Icon icon={Lock} tone="muted" size={12} />
									<Text variant="caption">{`After guess ${i}`}</Text>
								</View>
							)}
						</View>
					);
					return open && i === revealed - 1 && i > 0 ? (
						<Animated.View key={`${c.kind}-open`} entering={FadeInDown.duration(400)}>
							{body}
						</Animated.View>
					) : (
						<View key={`${c.kind}-${open}`}>{body}</View>
					);
				})}
			</View>
		</Section>
	);
}

/* ---------------------------------------------------------------- board --- */

function tileIcon(t: SeasonTile): LucideIcon {
	if (t.direction && t.verdict !== "match") return t.far ? (t.direction === "higher" ? ChevronsUp : ChevronsDown) : t.direction === "higher" ? ArrowUp : ArrowDown;
	return verdictIcon(t.verdict, null, t.key === "champion" ? Users : Factory);
}

function tileData(tile: SeasonTile, s: SgSeason): ClueTileData {
	const attr = SEASON_TILES.find((a) => a.key === tile.key)!;
	let content: ReactNode;
	let text: string;
	let hint: string;
	if (tile.key === "year") {
		content = <TileText strong>{String(s.year)}</TileText>;
		text = String(s.year);
		hint =
			tile.verdict === "match"
				? `${s.year}: a match`
				: `${s.year}: the mystery season is ${tile.direction === "higher" ? "later" : "earlier"}${tile.far ? ", by 10 years or more" : tile.verdict === "close" ? " (within 2 years)" : ""}`;
	} else if (tile.key === "rounds") {
		content = <TileText strong>{String(s.rounds)}</TileText>;
		text = String(s.rounds);
		hint =
			tile.verdict === "match"
				? `${plural(s.rounds, "round")}: a match`
				: `${plural(s.rounds, "round")}: the mystery season had ${tile.direction === "higher" ? "more" : "fewer"}${tile.verdict === "close" ? " (within 2)" : ""}`;
	} else if (tile.key === "champion") {
		const c = s.champion;
		content = (
			<>
				<Flag code={c.driver.flag} className="text-[13px] leading-4" />
				<TileText>{surname(c.driver.name)}</TileText>
			</>
		);
		text = `${c.driver.name} (${c.team.name})`;
		hint =
			tile.verdict === "match"
				? `Same champion: ${c.driver.name}`
				: tile.verdict === "close"
					? `${text}: the mystery season's champion drove for ${c.team.name} too`
					: `${text}: another champion and team`;
	} else {
		const t = s.constructors;
		content = <TileText className={t ? undefined : "opacity-80"}>{t ? t.name : "None"}</TileText>;
		text = t ? t.name : "no constructors' championship";
		hint = tile.verdict === "match" ? (t ? `Same constructors' champion: ${t.name}` : "Neither season had a constructors' championship") : `${t ? t.name : "No constructors' championship"}: not a match`;
	}
	return {
		key: tile.key,
		verdict: tile.verdict,
		direction: tile.direction,
		icon: tileIcon(tile),
		hint,
		srText: `${attr.label} ${text}: ${tile.verdict}${tile.direction ? `, mystery season's is ${tile.direction}` : ""}`,
		content,
	};
}

/* --------------------------------------------------------------- reveal --- */

function Person({ who, kind, extra }: { who: SgRef; kind: "driver" | "team"; extra?: string }) {
	return (
		<View className="flex-row flex-wrap items-center gap-x-2">
			<Flag code={who.flag} />
			<Text variant="small">
				<LinkText href={kind === "driver" ? href.driver(who.id) : href.team(who.id)}>{who.name}</LinkText>
			</Text>
			{extra ? <Text variant="caption">{extra}</Text> : null}
		</View>
	);
}

function Reveal({ season: s }: { season: SgSeason }) {
	const c = s.champion;
	return (
		<>
			<RevealTitle
				icon={CalendarDays}
				title={`${s.year} season`}
				subtitle={`${plural(s.rounds, "round")}${s.sprints > 0 ? ` · ${plural(s.sprints, "sprint")}` : ""} · ${plural(s.winners, "different winner")}`}
				href={href.season(s.year)}
			/>
			<Detail label="Champion">
				<Person who={c.driver} kind="driver" extra={`${c.team.name} · ${c.title === 1 ? "first title" : `${ordinal(c.title)} title`}`} />
			</Detail>
			<Detail label="Runner-up">
				<Person who={s.runnerUp.driver} kind="driver" extra={`${pts(round2(c.points - s.runnerUp.points))} behind`} />
			</Detail>
			<Detail label="Constructors' champion">{s.constructors ? <Person who={s.constructors} kind="team" /> : <Text variant="muted">None until 1958</Text>}</Detail>
			<View accessibilityLabel="Top of the drivers' standings">
				{s.top.map((t, i) => (
					<View key={t.driver.id} className="min-h-8 flex-row items-center gap-2.5">
						<Text variant="caption" className="w-6 tabular-nums">{`P${i + 1}`}</Text>
						<Flag code={t.driver.flag} />
						<Text variant="small" numberOfLines={1} className="flex-1">
							<Text variant="small" className="font-semibold">
								{t.driver.name}
							</Text>
							<Text variant="caption">{`  ${t.team.name}`}</Text>
						</Text>
						<Text variant="caption" className="text-foreground tabular-nums">{`${num(t.points)} pts`}</Text>
					</View>
				))}
			</View>
			<Figures
				items={[
					["Champion's wins", c.wins],
					["Poles", c.poles],
					["Podiums", c.podiums],
					["Points", c.points],
				]}
			/>
		</>
	);
}
