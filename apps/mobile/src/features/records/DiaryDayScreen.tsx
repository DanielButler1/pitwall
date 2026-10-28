// One date in the diary (/diary/<day-month>): titles decided, races held, drivers born and lost,
// debuts and first wins on that date in any year. Previous and next step through the calendar in
// place.

import { router, useLocalSearchParams } from "expo-router";
import { Cake, CalendarDays, Flower2, Medal, Rocket, Trophy, type LucideIcon } from "lucide-react-native";
import { View } from "react-native";
import { diaryView, parseDiarySlug, type DiaryPerson, type DiaryView } from "@pitwall/core/f1/diary";
import { DetailScreen, Flag, Page } from "@/components/f1";
import { Badge, Button, EmptyState, Icon, Row, Section, Text } from "@/components/ui";
import { useView } from "@/data/dataset";
import { fmtDate, num, plural, yearRange } from "@/lib/format";
import { href, useOpen } from "@/lib/links";
import { Stepper } from "./kit";

export function DiaryDayScreen() {
	const { date } = useLocalSearchParams<{ date: string }>();
	const parsed = parseDiarySlug(date ?? "");
	const view = useView((db) => (parsed ? diaryView(db, parsed.month, parsed.day) : null), [parsed?.month, parsed?.day]);
	const open = useOpen();
	if (!view)
		return (
			<DetailScreen title="Diary">
				<EmptyState icon={CalendarDays} title="No such date" body="Dates look like 23-october." />
			</DetailScreen>
		);
	const go = (slug: string) => router.setParams({ date: slug });
	const stats = [
		{ one: "Grand Prix", many: "Grands Prix", value: view.races.filter((r) => !r.upcoming).length },
		{ one: "driver born", many: "drivers born", value: view.births.length },
		{ one: "driver died", many: "drivers died", value: view.deaths.length },
		{ one: "debut", many: "debuts", value: view.debuts.length },
		{ one: "title decided", many: "titles decided", value: view.titles.length },
	].filter((s) => s.value > 0);
	const nothing = !view.races.length && !view.births.length && !view.deaths.length && !view.debuts.length && !view.firstWins.length;

	return (
		<DetailScreen title={view.label} subtitle="Diary">
			<Page>
				<Stepper className="pt-1" prev={view.prev.label} next={view.next.label} onPrev={() => go(view.prev.slug)} onNext={() => go(view.next.slug)} />
				<Text variant="muted" className="px-4 pt-3">{`Everything that happened in Formula 1 on ${view.label}, in any year.`}</Text>
				{stats.length ? (
					<View className="flex-row flex-wrap gap-x-4 gap-y-1 px-4 pt-3">
						{stats.map((s) => (
							<Text key={s.one} variant="muted">
								<Text variant="label" className="tabular-nums">{num(s.value)}</Text>
								{` ${s.value === 1 ? s.one : s.many}`}
							</Text>
						))}
					</View>
				) : null}

				{nothing ? <EmptyState icon={CalendarDays} title="A quiet day" body={`No races, birthdays or milestones on ${view.label}.`} /> : null}

				{view.titles.length ? (
					<Section title="Championships decided" description="The race after which no rival could catch the champion.">
						{view.titles.map((t, i) => (
							<Row
								key={`${t.kind}${t.race.year}`}
								leading={<View className="w-7 items-center"><Icon icon={Trophy} tone={t.kind === "driver" ? "gold" : "silver"} size={18} /></View>}
								title={t.driver?.name ?? t.team?.name ?? ""}
								subtitle={`${t.race.year} ${t.kind === "driver" ? "drivers'" : "constructors'"} title at the ${t.race.name}`}
								onPress={() => open(t.driver ? href.driver(t.driver.id) : t.team ? href.team(t.team.id) : href.race(t.race))}
								last={i === view.titles.length - 1}
							/>
						))}
					</Section>
				) : null}

				{view.races.length ? (
					<Section title="Races" description={`Grands Prix held on ${view.label}, latest first.`}>
						{view.races.map((r, i) => (
							<Row
								key={`${r.race.year}-${r.race.round}`}
								leading={<Text variant="label" className="w-12 tabular-nums" numberOfLines={1}>{r.race.year}</Text>}
								title={r.race.name}
								subtitle={[r.circuit.name, r.pole ? `Pole: ${r.pole.name}` : null].filter(Boolean).join(" · ")}
								trailing={
									r.upcoming ? (
										<Badge label="Upcoming" />
									) : r.winner ? (
										<View className="max-w-[45%] items-end">
											<View className="flex-row items-center gap-1">
												<Flag code={r.winner.country} />
												<Text variant="small" className="font-semibold" numberOfLines={1}>{short(r.winner.name)}</Text>
											</View>
											{r.winnerTeam ? <Text variant="caption" numberOfLines={1}>{r.winnerTeam.name}</Text> : null}
										</View>
									) : null
								}
								onPress={() => open(href.race(r.race))}
								last={i === view.races.length - 1}
							/>
						))}
					</Section>
				) : null}

				{view.births.length ? <People title="Born on this day" icon={Cake} rows={view.births} kind="birth" onOpen={open} /> : null}
				{view.deaths.length ? <People title="Died on this day" icon={Flower2} rows={view.deaths} kind="death" onOpen={open} /> : null}
				{view.debuts.length ? <Firsts title="Debuts" description="First Grand Prix start." icon={Rocket} rows={view.debuts} onOpen={open} /> : null}
				{view.firstWins.length ? <Firsts title="First wins" description="Maiden Grand Prix victories." icon={Medal} rows={view.firstWins} onOpen={open} /> : null}

				<Stepper className="mt-8" prev={view.prev.label} next={view.next.label} onPrev={() => go(view.prev.slug)} onNext={() => go(view.next.slug)} />
				<Button label="All dates" icon={CalendarDays} variant="ghost" size="sm" className="mx-4 mt-2" onPress={() => open("/diary")} />
			</Page>
		</DetailScreen>
	);
}

/** "M. Verstappen": the winner column is narrow on a phone. */
const short = (name: string) => {
	const parts = name.split(" ");
	return parts.length > 1 ? `${parts[0]![0]}. ${parts.slice(1).join(" ")}` : name;
};

function SectionTitle({ title, icon, description }: { title: string; icon: LucideIcon; description?: string }) {
	return (
		<View className="mb-1 px-4">
			<View className="flex-row items-center gap-2">
				<Icon icon={icon} tone="muted" size={18} />
				<Text variant="heading">{title}</Text>
			</View>
			{description ? <Text variant="muted" className="mt-0.5">{description}</Text> : null}
		</View>
	);
}

function People({ title, icon, rows, kind, onOpen }: { title: string; icon: LucideIcon; rows: DiaryPerson[]; kind: "birth" | "death"; onOpen(path: string): void }) {
	return (
		<Section>
			<SectionTitle title={title} icon={icon} />
			{rows.map((p, i) => {
				const life = kind === "death" ? (p.age != null ? `Aged ${p.age}` : null) : p.died ? `Died ${fmtDate(p.died)}${p.age != null ? `, aged ${p.age}` : ""}` : null;
				return (
					<Row
						key={p.driver.id}
						leading={<Text variant="label" className="w-12 tabular-nums" numberOfLines={1}>{p.year}</Text>}
						title={p.driver.name}
						subtitle={[yearRange(p.firstYear, p.lastYear), life].filter(Boolean).join(" · ")}
						trailing={
							<View className="items-end">
								<Text variant="small" className="tabular-nums">{plural(p.starts, "start")}</Text>
								{p.wins ? <Text variant="caption" className="tabular-nums">{plural(p.wins, "win")}</Text> : null}
								{p.titles ? <Text variant="caption" className="text-gold tabular-nums">{plural(p.titles, "title")}</Text> : null}
							</View>
						}
						onPress={() => onOpen(href.driver(p.driver.id))}
						last={i === rows.length - 1}
					/>
				);
			})}
		</Section>
	);
}

function Firsts({ title, description, icon, rows, onOpen }: { title: string; description: string; icon: LucideIcon; rows: DiaryView["debuts"]; onOpen(path: string): void }) {
	return (
		<Section>
			<SectionTitle title={title} icon={icon} description={description} />
			{rows.map((r, i) => (
				<Row
					key={r.driver.id}
					leading={<Text variant="label" className="w-12 tabular-nums" numberOfLines={1}>{r.race.year}</Text>}
					title={r.driver.name}
					subtitle={r.race.name}
					value={r.age != null ? `Aged ${r.age}` : null}
					onPress={() => onOpen(href.driver(r.driver.id))}
					last={i === rows.length - 1}
				/>
			))}
		</Section>
	);
}
