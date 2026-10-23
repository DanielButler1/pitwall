// Milestone watch (/milestones): round numbers coming up for the current grid, the names they are
// closing in on in the all-time lists, and upcoming anniversaries.

import { CalendarDays, Target } from "lucide-react-native";
import { useMemo, useState } from "react";
import { View } from "react-native";
import { ordinal } from "@pitwall/core/f1/anniversaries";
import { milestonesView, type Milestone, type MilestoneStat, type RecordChase, type Subject } from "@pitwall/core/f1/milestones";
import { DetailScreen, Flag, Page } from "@/components/f1";
import { Badge, EmptyState, Row, Section, Text } from "@/components/ui";
import { useView } from "@/data/dataset";
import { fmtDate, num } from "@/lib/format";
import { href, useOpen } from "@/lib/links";
import { UpcomingAnniversaries } from "./Anniversaries";
import { Choice, ChoiceChips, Note } from "./kit";

const STAT: Record<MilestoneStat, { one: string; many: string; title: string }> = {
	wins: { one: "win", many: "wins", title: "Wins" },
	podiums: { one: "podium", many: "podiums", title: "Podiums" },
	poles: { one: "pole", many: "poles", title: "Pole positions" },
	titles: { one: "title", many: "titles", title: "Championships" },
	starts: { one: "start", many: "starts", title: "Starts" },
	points: { one: "point", many: "points", title: "Points" },
	fastestLaps: { one: "fastest lap", many: "fastest laps", title: "Fastest laps" },
};

const ETA_NOTE = "Estimates use each driver's or team's rate over their last 22 races; when the name they are chasing is still racing, only the rate they are closing the gap at counts.";

type Who = "all" | "driver" | "team";

const nameOf = (s: Subject) => (s.kind === "driver" ? s.driver.name : s.team.name);
const countryOf = (s: Subject) => (s.kind === "driver" ? s.driver.country : s.team.country);
const pathOf = (s: Subject) => (s.kind === "driver" ? href.driver(s.driver.id) : href.team(s.team.id));
const keyOf = (s: Subject) => (s.kind === "driver" ? `d:${s.driver.id}` : `t:${s.team.id}`);

/** "100th start", "500 points". */
const markLabel = (m: Pick<Milestone, "stat" | "target">) => (m.stat === "points" ? `${num(m.target)} points` : `${ordinal(m.target)} ${STAT[m.stat].one}`);

function needText(c: RecordChase) {
	if (c.stat === "points") return `${num(c.needed)} pts behind`;
	return `${num(c.needed)} more ${c.needed === 1 ? STAT[c.stat].one : STAT[c.stat].many}`;
}

/** Who they'd pass: up to three names, then a count. */
function targets(c: RecordChase) {
	const all = c.target.subjects;
	const shown = all.slice(0, all.length > 3 ? 2 : 3).map(nameOf);
	const rest = all.length - shown.length;
	return `${shown.join(", ")}${rest ? ` +${rest} more` : ""} (${num(c.target.value)})`;
}

function Eta({ eta, soon }: { eta: number | null; soon: boolean }) {
	if (eta == null) return null;
	if (eta === 1) return <Badge label="Next race" tone="primary" />;
	return (
		<View className="items-end gap-1">
			<Text variant="caption" className="tabular-nums">{`~${eta} races`}</Text>
			{soon ? <Badge label="This season" /> : null}
		</View>
	);
}

export function MilestonesScreen() {
	const view = useView((db) => milestonesView(db), []);
	const open = useOpen();
	const [tab, setTab] = useState<"coming" | "chases">("coming");
	const [who, setWho] = useState<Who>("all");
	const [stat, setStat] = useState<"all" | MilestoneStat>("all");
	const pick = <T extends { subject: Subject; stat: MilestoneStat }>(xs: T[]) => xs.filter((x) => (who === "all" || x.subject.kind === who) && (stat === "all" || x.stat === stat));
	const stats = useMemo(() => {
		const xs = view ? [...view.milestones, ...view.chases] : [];
		return Object.keys(STAT).filter((s) => xs.some((x) => x.stat === s)) as MilestoneStat[];
	}, [view]);

	if (!view)
		return (
			<DetailScreen title="Milestone watch">
				<EmptyState icon={Target} title="No season yet" body="There are no results to measure milestones against." />
			</DetailScreen>
		);
	const soon = (eta: number | null, thisSeason: boolean) => view.inProgress && thisSeason && eta != null && eta > 1;
	const milestones = pick(view.milestones);
	const chases = pick(view.chases);
	const byStat = new Map<MilestoneStat, RecordChase[]>();
	for (const c of chases) byStat.set(c.stat, [...(byStat.get(c.stat) ?? []), c]);

	return (
		<DetailScreen title="Milestone watch" subtitle={`The ${view.year} grid`}>
			<Page>
				<Text variant="muted" className="px-4 pt-1">
					Round numbers coming up for the drivers and teams on the current grid, and the names they are closing in on in the all-time lists.
				</Text>
				{view.nextRace ? (
					<Section className="mt-3">
						<Row icon={CalendarDays} title={`${view.nextRace.year} ${view.nextRace.name}`} subtitle={`Next race · ${fmtDate(view.nextRace.date)}`} onPress={() => open(href.race(view.nextRace!))} last />
					</Section>
				) : null}

				<Choice
					className="mt-4"
					value={tab}
					onChange={setTab}
					options={[
						{ value: "coming", label: `Coming up (${view.milestones.length})` },
						{ value: "chases", label: `Record chases (${view.chases.length})` },
					]}
				/>
				<ChoiceChips
					className="mt-3"
					value={who}
					onChange={setWho}
					options={[
						{ value: "all", label: "Everyone" },
						{ value: "driver", label: "Drivers" },
						{ value: "team", label: "Teams" },
					]}
				/>
				<ChoiceChips className="mt-2" value={stat} onChange={setStat} options={[{ value: "all", label: "Every stat" }, ...stats.map((s) => ({ value: s, label: STAT[s].title }))]} />

				{tab === "coming" ? (
					<Section title="Coming up" description="The next round-number milestone each driver and team is expected to reach within about a season.">
						{milestones.length ? (
							milestones.map((m, i) => (
								<Row
									key={`${keyOf(m.subject)}:${m.stat}`}
									leading={<View className="w-7 items-center"><Flag code={countryOf(m.subject)} /></View>}
									title={nameOf(m.subject)}
									subtitle={`${markLabel(m)} · ${num(m.current)} now · ${num(m.needed)} to go`}
									trailing={<Eta eta={m.eta} soon={soon(m.eta, m.thisSeason)} />}
									onPress={() => open(pathOf(m.subject))}
									last={i === milestones.length - 1}
								/>
							))
						) : (
							<Text variant="muted" className="px-4 pt-2">Nothing round-numbered is within reach right now.</Text>
						)}
					</Section>
				) : (
					<>
						<Section title="Record chases" description="Who each driver and team on the grid passes next on the all-time lists, for climbs into the top 30." />
						{[...byStat].map(([s, list]) => (
							<Section key={s} title={STAT[s].title} className="mt-4">
								{list.map((c, i) => (
									<Row
										key={`${keyOf(c.subject)}:${c.stat}`}
										leading={<View className="w-7 items-center"><Flag code={countryOf(c.subject)} /></View>}
										title={nameOf(c.subject)}
										numberOfLines={1}
										subtitle={`${c.stat === "points" ? needText(c) : `${needText(c)} to pass`} ${targets(c)}`}
										trailing={
											<View className="items-end gap-1">
												<Text variant="small" className="font-semibold tabular-nums">{`${ordinal(c.rank)} → ${ordinal(c.newRank)}`}</Text>
												<Eta eta={c.eta} soon={soon(c.eta, c.thisSeason)} />
											</View>
										}
										onPress={() => open(pathOf(c.subject))}
										last={i === list.length - 1}
									/>
								))}
							</Section>
						))}
						{!chases.length ? <Text variant="muted" className="px-4 pt-2">No all-time places are within reach right now.</Text> : null}
						<Section>
							<Row title="All records" onPress={() => open("/records")} last />
						</Section>
					</>
				)}
				<Note>{ETA_NOTE}</Note>

				<UpcomingAnniversaries events={view.anniversaries} days={60} onOpen={open} />
			</Page>
		</DetailScreen>
	);
}
