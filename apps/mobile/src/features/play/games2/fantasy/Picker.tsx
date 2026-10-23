// The draft list: driver-seasons or constructor-seasons, searched and filtered (decade, team,
// nation, sort, only what can be picked), fifty at a time. Each row has its season line and form;
// Add is disabled with the reason shown when a pick isn't allowed.

import { Check, Plus } from "lucide-react-native";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { addBlocker, driverIneligible, teamAddBlocker, teamIneligible, type DriverSeason, type Pool, type Rules, type Team, type TeamSeason } from "@pitwall/core/game/fantasy";
import { Flag } from "@/components/f1";
import { Badge, Button, Chip, ChipRow, Icon, SearchField, Segmented, Text } from "@/components/ui";
import { Switch, switchHaptic } from "@/components/ui/switch";
import { cn } from "@/lib/cn";
import { num, ordinal } from "@/lib/format";
import { haptic } from "@/lib/haptics";
import { href, useOpen } from "@/lib/links";
import { Sheet } from "../parts";
import { FormLine, money, nationFlag } from "./shared";

type Sort = "price" | "price-asc" | "year" | "year-asc" | "name";
const SORTS: { value: Sort; label: string }[] = [
	{ value: "price", label: "Priciest first" },
	{ value: "price-asc", label: "Cheapest first" },
	{ value: "year", label: "Newest first" },
	{ value: "year-asc", label: "Oldest first" },
	{ value: "name", label: "Name" },
];
const PAGE = 20;

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function sortSeasons<T extends { y: number; p: number; id: string }>(list: T[], sort: Sort, name: (s: T) => string): T[] {
	const cmp: Record<Sort, (a: T, b: T) => number> = {
		price: (a, b) => b.p - a.p || b.y - a.y,
		"price-asc": (a, b) => a.p - b.p || b.y - a.y,
		year: (a, b) => b.y - a.y || b.p - a.p,
		"year-asc": (a, b) => a.y - b.y || b.p - a.p,
		name: (a, b) => name(a).localeCompare(name(b)) || a.y - b.y,
	};
	return [...list].sort(cmp[sort]);
}

type Option = { value: string; label: string };
type Filter = "decade" | "team" | "nation" | "sort";

export function Picker({ pool, rules, team, onChange }: { pool: Pool; rules: Rules; team: Team; onChange: (t: Team) => void }) {
	const { data } = pool;
	const [tab, setTab] = useState<"drivers" | "teams">("drivers");
	const [q, setQ] = useState("");
	const [decade, setDecade] = useState("all");
	const [teamFilter, setTeamFilter] = useState("all");
	const [nation, setNation] = useState("all");
	const [sort, setSort] = useState<Sort>("price");
	const [onlyPickable, setOnlyPickable] = useState(false);
	const [limit, setLimit] = useState(PAGE);
	const [choosing, setChoosing] = useState<Filter | null>(null);
	const [filterKey, setFilterKey] = useState("");

	// back to the first page whenever the list changes
	const key = `${tab}|${q}|${decade}|${teamFilter}|${nation}|${sort}|${onlyPickable}`;
	if (key !== filterKey) {
		setFilterKey(key);
		setLimit(PAGE);
	}

	const decades = useMemo(() => {
		const out: Option[] = [{ value: "all", label: "All decades" }];
		for (let d = Math.floor(data.from / 10) * 10; d <= data.to; d += 10) out.push({ value: String(d), label: `${d}s` });
		return out;
	}, [data]);
	const teamOptions = useMemo(() => {
		const count = new Map<string, number>();
		for (const s of data.cs) count.set(s.t, (count.get(s.t) ?? 0) + 1);
		return [{ value: "all", label: "All teams" }, ...[...count].sort((a, b) => b[1] - a[1] || data.teams[a[0]][0].localeCompare(data.teams[b[0]][0])).map(([id]) => ({ value: id, label: data.teams[id][0] }))];
	}, [data]);
	const nationOptions = useMemo(() => {
		const count = new Map<string, number>();
		for (const s of data.ds) count.set(data.drivers[s.d][1], (count.get(data.drivers[s.d][1]) ?? 0) + 1);
		return [{ value: "all", label: "All nations" }, ...[...count].sort((a, b) => b[1] - a[1]).map(([id]) => ({ value: id, label: data.nations[id]?.[0] ?? id }))];
	}, [data]);

	const drivers = useMemo(() => {
		if (tab !== "drivers") return [];
		const terms = fold(q).split(/\s+/).filter(Boolean);
		const list = data.ds.filter((s) => {
			if ((decade !== "all" && Math.floor(s.y / 10) * 10 !== Number(decade)) || driverIneligible(s, rules)) return false;
			if (teamFilter !== "all" && !s.t.includes(teamFilter)) return false;
			if (nation !== "all" && data.drivers[s.d][1] !== nation) return false;
			if (terms.length) {
				const hay = fold(`${data.drivers[s.d][0]} ${s.y} ${s.t.map((t) => data.teams[t][0]).join(" ")}`);
				if (!terms.every((t) => hay.includes(t))) return false;
			}
			if (onlyPickable && !team.drivers.includes(s.id) && addBlocker(pool, team, rules, s)) return false;
			return true;
		});
		return sortSeasons(list, sort, (s) => data.drivers[s.d][0]);
	}, [tab, data, decade, teamFilter, nation, q, sort, onlyPickable, team, rules, pool]);

	const teams = useMemo(() => {
		if (tab !== "teams") return [];
		const terms = fold(q).split(/\s+/).filter(Boolean);
		const list = data.cs.filter((s) => {
			if ((decade !== "all" && Math.floor(s.y / 10) * 10 !== Number(decade)) || teamIneligible(s, rules)) return false;
			if (teamFilter !== "all" && s.t !== teamFilter) return false;
			if (nation !== "all" && data.teams[s.t][1] !== nation) return false;
			if (terms.length) {
				const hay = fold(`${data.teams[s.t][0]} ${s.y} ${s.ds.map((d) => data.drivers[d]?.[0]).join(" ")}`);
				if (!terms.every((t) => hay.includes(t))) return false;
			}
			if (onlyPickable && team.constructor !== s.id && teamAddBlocker(pool, team, rules, s)) return false;
			return true;
		});
		return sortSeasons(list, sort, (s) => data.teams[s.t][0]);
	}, [tab, data, decade, teamFilter, nation, q, sort, onlyPickable, team, rules, pool]);

	// stable handlers (reading the latest team through a ref), so memoised rows only re-render when their own pick or blocker changes
	const latest = useRef({ team, rules, onChange });
	useEffect(() => {
		latest.current = { team, rules, onChange };
	});
	const toggleDriver = useCallback(
		(s: DriverSeason) => {
			const { team, rules, onChange } = latest.current;
			haptic("selection");
			if (team.drivers.includes(s.id)) onChange({ ...team, drivers: team.drivers.filter((id) => id !== s.id), captain: team.captain === s.id ? null : team.captain });
			else if (!addBlocker(pool, team, rules, s)) onChange({ ...team, drivers: [...team.drivers, s.id] });
		},
		[pool],
	);
	const toggleTeam = useCallback(
		(s: TeamSeason) => {
			const { team, rules, onChange } = latest.current;
			haptic("selection");
			if (team.constructor === s.id) onChange({ ...team, constructor: null });
			else if (!teamAddBlocker(pool, team, rules, s)) onChange({ ...team, constructor: s.id });
		},
		[pool],
	);
	const count = tab === "drivers" ? drivers.length : teams.length;

	const filters: Record<Filter, { options: Option[]; value: string; set: (v: string) => void; title: string }> = {
		decade: { options: decades, value: decade, set: setDecade, title: "Decade" },
		team: { options: teamOptions, value: teamFilter, set: setTeamFilter, title: "Team" },
		nation: { options: nationOptions, value: nation, set: setNation, title: "Nation" },
		sort: { options: SORTS, value: sort, set: (v) => setSort(v as Sort), title: "Sort" },
	};
	const labelOf = (f: Filter) => filters[f].options.find((o) => o.value === filters[f].value)?.label ?? "";
	const chooser = choosing ? filters[choosing] : null;

	return (
		<View className="mt-6">
			<View className="gap-3 px-4">
				<Text variant="heading">Pick your team</Text>
				<Segmented
					value={tab}
					onChange={(v) => {
						haptic("selection");
						setTab(v);
					}}
					options={[
						{ value: "drivers", label: `Drivers ${team.drivers.length}/${rules.drivers}` },
						{ value: "teams", label: `Constructor ${team.constructor ? 1 : 0}/1` },
					]}
				/>
				<SearchField value={q} onChangeText={setQ} placeholder={tab === "drivers" ? "Driver, team or year" : "Team, driver or year"} />
			</View>
			<ChipRow className="mt-3">
				{(["decade", "team", "nation", "sort"] as Filter[]).map((f) => (
					<Chip key={f} label={labelOf(f)} dropdown selected={f !== "sort" && filters[f].value !== "all"} onPress={() => setChoosing(f)} />
				))}
			</ChipRow>
			<Pressable
				accessibilityRole="switch"
				accessibilityState={{ checked: onlyPickable }}
				onPress={() => {
					switchHaptic(!onlyPickable);
					setOnlyPickable(!onlyPickable);
				}}
				className="mt-2 min-h-12 flex-row items-center justify-between gap-3 px-4"
			>
				<Text variant="body">Only what I can pick</Text>
				<View pointerEvents="none">
					<Switch value={onlyPickable} accessibilityLabel="Only what I can pick" />
				</View>
			</Pressable>

			<View className="mt-1 border-t border-border">
				{tab === "drivers"
					? drivers.slice(0, limit).map((s) => (
							<DriverRow key={s.id} pool={pool} s={s} picked={team.drivers.includes(s.id)} blocker={team.drivers.includes(s.id) ? null : addBlocker(pool, team, rules, s)} onToggle={toggleDriver} />
						))
					: teams.slice(0, limit).map((s) => (
							<TeamRow key={s.id} pool={pool} s={s} picked={team.constructor === s.id} blocker={team.constructor === s.id ? null : teamAddBlocker(pool, team, rules, s)} onToggle={toggleTeam} />
						))}
			</View>
			<View className="flex-row items-center justify-between gap-3 px-4 py-3">
				<Text variant="muted" className="tabular-nums">
					{count ? `${num(Math.min(limit, count))} of ${num(count)}` : "Nothing matches these filters"}
				</Text>
				{count > limit ? <Button label="Show more" variant="outline" size="sm" onPress={() => setLimit((l) => l + PAGE * 2)} /> : null}
			</View>

			<Sheet open={!!chooser} onClose={() => setChoosing(null)} title={chooser?.title ?? ""}>
				<ScrollView contentContainerClassName="pb-8">
					{chooser?.options.map((o) => (
						<Pressable
							key={o.value}
							accessibilityRole="button"
							accessibilityState={{ selected: chooser.value === o.value }}
							onPress={() => {
								haptic("selection");
								chooser.set(o.value);
								setChoosing(null);
							}}
							className={cn("min-h-12 flex-row items-center gap-3 border-b border-border px-4 active:bg-accent", chooser.value === o.value && "bg-accent")}
						>
							<Text variant="body" className={cn("flex-1", chooser.value === o.value && "font-semibold")}>
								{o.label}
							</Text>
							{chooser.value === o.value ? <Icon icon={Check} tone="primary" size={18} /> : null}
						</Pressable>
					))}
				</ScrollView>
			</Sheet>
		</View>
	);
}

/** "1st in the championship · 300 pts · 22 starts" */
const statLine = (parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(" · ");
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

/** "2023 · Champion · Red Bull" under a pick's name. */
function SeasonLine({ year, champion, detail }: { year: number; champion: boolean; detail: string }) {
	return (
		<View className="flex-row items-center gap-1.5">
			<Text variant="caption" className="font-semibold text-foreground tabular-nums">
				{year}
			</Text>
			{champion ? <Badge label="Champion" tone="warning" /> : null}
			<Text variant="caption" numberOfLines={1} className="shrink">
				{detail}
			</Text>
		</View>
	);
}

function PickButton({ picked, blocker, onPress, label }: { picked: boolean; blocker: string | null; onPress: () => void; label: string }) {
	const disabled = !picked && !!blocker;
	return (
		<Pressable
			accessibilityRole="button"
			accessibilityState={{ selected: picked, disabled }}
			accessibilityLabel={picked ? `Remove ${label}` : blocker ? `${label}: ${blocker}` : `Add ${label}`}
			disabled={disabled}
			onPress={onPress}
			hitSlop={6}
			className={cn("h-9 w-20 flex-row items-center justify-center gap-1 rounded-md", picked ? "bg-secondary" : "border border-border active:bg-accent", disabled && "opacity-40")}
		>
			<Icon icon={picked ? Check : Plus} tone={picked ? "primary" : "foreground"} size={15} />
			<Text variant="small" className="font-semibold">
				{picked ? "Picked" : "Add"}
			</Text>
		</Pressable>
	);
}

const DriverRow = memo(function DriverRow({ pool, s, picked, blocker, onToggle }: { pool: Pool; s: DriverSeason; picked: boolean; blocker: string | null; onToggle: (s: DriverSeason) => void }) {
	const open = useOpen();
	const { data } = pool;
	const [name, nation] = data.drivers[s.d];
	const finishes = useMemo(() => new Map(s.r.map((r) => [r[0], r[1]])), [s]);
	return (
		<View className={cn("gap-1.5 border-b border-border px-4 py-3", picked && "bg-primary/5")}>
			<View className="flex-row items-start gap-3">
				<View className="flex-1 gap-0.5">
					<Pressable accessibilityRole="link" onPress={() => open(href.driver(s.d))} className="flex-row items-center gap-1.5 self-start active:opacity-70">
						<Flag code={nationFlag(pool, nation)} />
						<Text variant="label" numberOfLines={1} className="shrink">
							{name}
						</Text>
					</Pressable>
					<SeasonLine year={s.y} champion={s.cp === 1} detail={s.t.map((t) => data.teams[t]?.[0]).join(", ")} />
				</View>
				<Text variant="label" className="pt-0.5 tabular-nums">
					{money(s.p)}
				</Text>
				<PickButton picked={picked} blocker={blocker} onPress={() => onToggle(s)} label={`${name} ${s.y}`} />
			</View>
			<Text variant="caption" className="tabular-nums">
				{statLine([s.cp ? `${ordinal(s.cp)} in the championship` : "Unclassified", `${num(s.pts)} pts`, `${s.st} starts`, s.w > 0 && plural(s.w, "win"), s.pod > 0 && plural(s.pod, "podium"), s.pl > 0 && plural(s.pl, "pole")])}
			</Text>
			<FormLine pool={pool} year={s.y} finishes={finishes} />
			{blocker && !picked ? (
				<Text variant="caption" className="text-warning">
					{blocker}
				</Text>
			) : null}
		</View>
	);
});

const TeamRow = memo(function TeamRow({ pool, s, picked, blocker, onToggle }: { pool: Pool; s: TeamSeason; picked: boolean; blocker: string | null; onToggle: (s: TeamSeason) => void }) {
	const open = useOpen();
	const { data } = pool;
	const [name, nation] = data.teams[s.t];
	const best = (a: number, b: number) => (a >= 1 && (b < 1 || a < b) ? a : b >= 1 ? b : a);
	const finishes = useMemo(() => new Map(s.r.map((r) => [r[0], best(r[1], r[2])])), [s]);
	return (
		<View className={cn("gap-1.5 border-b border-border px-4 py-3", picked && "bg-primary/5")}>
			<View className="flex-row items-start gap-3">
				<View className="flex-1 gap-0.5">
					<Pressable accessibilityRole="link" onPress={() => open(href.team(s.t))} className="flex-row items-center gap-1.5 self-start active:opacity-70">
						<Flag code={nationFlag(pool, nation)} />
						<Text variant="label" numberOfLines={1} className="shrink">
							{name}
						</Text>
					</Pressable>
					<SeasonLine year={s.y} champion={s.cp === 1 && s.y >= 1958} detail={s.ds.map((d) => data.drivers[d]?.[0]).join(", ")} />
				</View>
				<Text variant="label" className="pt-0.5 tabular-nums">
					{money(s.p)}
				</Text>
				<PickButton picked={picked} blocker={blocker} onPress={() => onToggle(s)} label={`${name} ${s.y}`} />
			</View>
			<Text variant="caption" className="tabular-nums">
				{statLine([s.cp ? `${ordinal(s.cp)} among constructors` : "Unranked", `${num(s.pts)} pts`, `${s.st} races`, s.w > 0 && plural(s.w, "win"), s.pod > 0 && plural(s.pod, "podium")])}
			</Text>
			<FormLine pool={pool} year={s.y} finishes={finishes} />
			{blocker && !picked ? (
				<Text variant="caption" className="text-warning">
					{blocker}
				</Text>
			) : null}
		</View>
	);
});
