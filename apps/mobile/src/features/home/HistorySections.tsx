// The home page's history sections: on this day, the all-time leaders and the milestone watch.

import type { OnThisDayItem, OnThisDayView } from "@pitwall/core/f1/diary";
import type { Milestone, MilestoneStat, MilestoneWatch, RecordChase, Subject } from "@pitwall/core/f1/milestones";
import type { HomeView } from "@pitwall/core/f1/views";
import { Cake, Crown, Target, TrendingUp, Trophy } from "lucide-react-native";
import { memo } from "react";
import { View } from "react-native";
import { Icon, Row, Section, Text } from "@/components/ui";
import { num, ordinal, plural } from "@/lib/format";
import { href } from "@/lib/links";
import { MoreLink, SubHeading } from "./kit";
import type { FactEntry } from "@pitwall/core/f1/race-facts";
import { FactEntryList } from "@/components/facts";

type Go = (path: string) => void;

/* ---------------------------------------------------------- on this day --- */

const careerLine = (p: { titles: number; wins: number; starts: number }) => (p.titles ? `${p.titles}× champion` : p.wins ? plural(p.wins, "win") : plural(p.starts, "start"));

/** One highlight as a sentence and a detail line, and where tapping it goes. */
function describe(item: OnThisDayItem): { title: string; subtitle?: string; path: string; icon?: typeof Crown } {
	switch (item.kind) {
		case "title":
			return { title: `${item.driver ? `${item.driver.name} sealed` : "Sealed"} the ${item.year} title at the ${item.race.name}`, subtitle: item.team?.name, path: item.driver ? href.driver(item.driver.id) : href.race(item.race), icon: Crown };
		case "firstWin":
			return { title: `${item.driver.name}'s first Grand Prix win, at the ${item.race.name}`, path: href.race(item.race), icon: Trophy };
		case "race":
			return { title: item.race.name, subtitle: item.winner ? `Won by ${item.winner.name}${item.winnerTeam ? ` · ${item.winnerTeam.name}` : ""}` : undefined, path: href.race(item.race) };
		case "debut":
			return { title: `${item.driver.name}'s first start, at the ${item.race.name}`, subtitle: careerLine(item), path: href.driver(item.driver.id) };
		case "birth":
			return { title: `${item.driver.name} was born`, subtitle: careerLine(item), path: href.driver(item.driver.id), icon: Cake };
	}
}

function YearBox({ year }: { year: number }) {
	return (
		<View className="h-6 w-12 items-center justify-center rounded-md bg-muted">
			<Text variant="caption" className="font-semibold tabular-nums text-foreground">
				{year}
			</Text>
		</View>
	);
}

export const OnThisDay = memo(function OnThisDay({ day, go, facts }: { day: OnThisDayView; go: Go; facts?: FactEntry[] | null }) {
	return (
		<Section title="On this day" description={`${day.label} in Formula 1 history`} action={<MoreLink label="More" onPress={() => go(href.diary(day.slug))} />}>
			{day.items.length ? (
				day.items.map((item, i, all) => {
					const d = describe(item);
					return (
						<Row
							key={`${item.kind}:${i}`}
							leading={<YearBox year={item.year} />}
							title={d.title}
							subtitle={d.subtitle}
							numberOfLines={3}
							trailing={d.icon ? <Icon icon={d.icon} tone={d.icon === Cake ? "muted" : "gold"} size={15} /> : undefined}
							onPress={() => go(d.path)}
							last={i === all.length - 1}
						/>
					);
				})
			) : (
				<Text variant="muted" className="px-4 py-2">
					A quiet day in the history books: no races, titles or maiden wins.
				</Text>
			)}
			{facts?.length ? (
				<View className="pt-2">
					<Text variant="caption" className="px-4">
						Did you know?
					</Text>
					<FactEntryList entries={facts} />
				</View>
			) : null}
		</Section>
	);
});

/* ------------------------------------------------------ all-time leaders --- */

function Rank({ n }: { n: number }) {
	return (
		<Text variant="muted" className="w-6 tabular-nums">
			{n}
		</Text>
	);
}

function Figure({ icon, gold, value }: { icon: typeof Crown; gold: boolean; value: number }) {
	return (
		<View className="flex-row items-center gap-1.5">
			<Icon icon={icon} tone={gold ? "gold" : "muted"} size={14} />
			<Text variant="label" className="tabular-nums">
				{num(value)}
			</Text>
		</View>
	);
}

export const MostWins = memo(function MostWins({ view, go }: { view: HomeView; go: Go }) {
	return (
		<Section title="Most race wins" action={<MoreLink label="All records" onPress={() => go("/records")} />}>
			{view.topWinners.map((w, i, all) => (
				<Row key={w.driver.id} leading={<Rank n={i + 1} />} title={w.driver.name} trailing={<Figure icon={Trophy} gold={i === 0} value={w.value} />} onPress={() => go(href.driver(w.driver.id))} last={i === all.length - 1} />
			))}
		</Section>
	);
});

export const MostTitles = memo(function MostTitles({ view, go }: { view: HomeView; go: Go }) {
	return (
		<Section title="Most championships" action={<MoreLink label="All champions" onPress={() => go("/seasons")} />}>
			{view.topChampions.map((c, i, all) => (
				<Row
					key={c.driver.id}
					leading={<Rank n={i + 1} />}
					title={c.driver.name}
					subtitle={plural(c.wins, "win")}
					trailing={<Figure icon={Crown} gold={i === 0} value={c.titles} />}
					onPress={() => go(href.driver(c.driver.id))}
					last={i === all.length - 1}
				/>
			))}
		</Section>
	);
});

/* ------------------------------------------------------- milestone watch --- */

const STAT: Record<MilestoneStat, { one: string; many: string }> = {
	wins: { one: "win", many: "wins" },
	podiums: { one: "podium", many: "podiums" },
	poles: { one: "pole", many: "poles" },
	titles: { one: "title", many: "titles" },
	starts: { one: "start", many: "starts" },
	points: { one: "point", many: "points" },
	fastestLaps: { one: "fastest lap", many: "fastest laps" },
};

const subjectName = (s: Subject) => (s.kind === "driver" ? s.driver.name : s.team.name);
const subjectPath = (s: Subject) => (s.kind === "driver" ? href.driver(s.driver.id) : href.team(s.team.id));
const subjectKey = (s: Subject) => (s.kind === "driver" ? `d:${s.driver.id}` : `t:${s.team.id}`);

/** "100th start", "500 points". */
const markLabel = (m: Pick<Milestone, "stat" | "target">) => (m.stat === "points" ? `${num(m.target)} points` : `${ordinal(m.target)} ${STAT[m.stat].one}`);

function needText(c: RecordChase) {
	if (c.stat === "points") return `${num(c.needed)} pts behind`;
	return `${num(c.needed)} more ${c.needed === 1 ? STAT[c.stat].one : STAT[c.stat].many}`;
}

function chaseLine(c: RecordChase) {
	const [first] = c.target.subjects;
	const who = `${first ? subjectName(first) : ""}${c.target.subjects.length > 1 ? ` and ${c.target.subjects.length - 1} more` : ""}`;
	const figure = `${num(c.target.value)}${c.stat === "points" ? " pts" : ""}`;
	return `${c.stat === "points" ? `${needText(c)} ` : `Needs ${needText(c)} to pass `}${who} (${figure}) · ${ordinal(c.rank)} → ${ordinal(c.newRank)} all-time`;
}

const eta = (n: number | null) => (n == null ? null : n === 1 ? "Next race" : `~${n} races`);

export const MilestoneWatchSection = memo(function MilestoneWatchSection({ watch, go }: { watch: MilestoneWatch; go: Go }) {
	if (!watch.milestones.length && !watch.chases.length) return null;
	return (
		<Section title="Milestone watch" description="Coming up for the current grid" action={<MoreLink label="All milestones" onPress={() => go("/milestones")} />}>
			{watch.milestones.length ? (
				<>
					<SubHeading icon={Target}>Round numbers</SubHeading>
					{watch.milestones.map((m, i, all) => (
						<Row
							key={`${subjectKey(m.subject)}:${m.stat}`}
							title={subjectName(m.subject)}
							subtitle={`${markLabel(m)} · ${num(m.needed)} to go`}
							value={eta(m.eta)}
							onPress={() => go(subjectPath(m.subject))}
							last={i === all.length - 1}
						/>
					))}
				</>
			) : null}
			{watch.chases.length ? (
				<>
					<SubHeading icon={TrendingUp}>Record chases</SubHeading>
					{watch.chases.map((c, i, all) => (
						<Row
							key={`${subjectKey(c.subject)}:${c.stat}`}
							title={subjectName(c.subject)}
							subtitle={chaseLine(c)}
							value={eta(c.eta)}
							onPress={() => go(subjectPath(c.subject))}
							last={i === all.length - 1}
						/>
					))}
				</>
			) : null}
		</Section>
	);
});
