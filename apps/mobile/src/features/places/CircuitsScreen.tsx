import { useMemo, useState } from "react";
import { circuitsView } from "@pitwall/core/f1/views";
import { ChoiceChips, IndexScreen, matcher, Switcher, type IndexRowData } from "@/features/browse/kit";
import { useView } from "@/data/dataset";
import { plural, yearRange } from "@/lib/format";
import { href, useOpen } from "@/lib/links";

type Scope = "all" | "current";
type Kind = "all" | "RACE" | "STREET" | "ROAD";
type Sort = "latest" | "races" | "name";

export function CircuitsScreen() {
	const { rows, calendar, year } = useView((db) => {
		const year = db.years.at(-1) ?? 0;
		return { rows: circuitsView(db).rows, calendar: new Set((db.racesByYear.get(year) ?? []).map((r) => r.circuitId)), year };
	}, []);
	const open = useOpen();
	const [query, setQuery] = useState("");
	const [scope, setScope] = useState<Scope>("all");
	const [kind, setKind] = useState<Kind>("all");
	const [sort, setSort] = useState<Sort>("latest");
	const list = useMemo<IndexRowData[]>(() => {
		const match = matcher(query);
		const out = rows.filter((c) => (match(c.name) || match(c.place) || match(c.nation.name)) && (scope === "all" || calendar.has(c.id)) && (kind === "all" || c.type === kind));
		if (sort === "races") out.sort((a, b) => b.races - a.races || (b.lastYear ?? 0) - (a.lastYear ?? 0));
		if (sort === "name") out.sort((a, b) => a.name.localeCompare(b.name));
		return out.map((c) => ({
			key: c.id,
			flag: c.country,
			title: c.name,
			subtitle: [c.place === c.name ? c.nation.name : c.place, yearRange(c.firstYear, c.lastYear)].filter(Boolean).join(" · "),
			value: c.races ? plural(c.races, "race") : "Upcoming",
			onPress: () => open(href.circuit(c.id)),
		}));
	}, [rows, calendar, query, scope, kind, sort, open]);
	return (
		<IndexScreen
			title="Circuits"
			subtitle={`${rows.length} venues`}
			query={query}
			onQuery={setQuery}
			placeholder="Search circuits or places"
			rows={list}
			header={
				<>
					<Switcher<Scope> value={scope} onChange={setScope} options={[{ value: "all", label: "All" }, { value: "current", label: `${year} calendar` }]} />
					<ChoiceChips<Kind> value={kind} onChange={setKind} options={[{ value: "all", label: "All types" }, { value: "RACE", label: "Race circuit" }, { value: "STREET", label: "Street" }, { value: "ROAD", label: "Road" }]} />
					<ChoiceChips<Sort> value={sort} onChange={setSort} options={[{ value: "latest", label: "Latest" }, { value: "races", label: "Most races" }, { value: "name", label: "Name" }]} />
				</>
			}
		/>
	);
}
