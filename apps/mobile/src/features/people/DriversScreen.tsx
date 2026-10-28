import { useMemo, useState } from "react";
import { activeGrid } from "@pitwall/core/f1/milestones";
import { driversView } from "@pitwall/core/f1/views";
import { useView } from "@/data/dataset";
import { ChoiceChips, decadeOptions, inDecade, IndexScreen, matcher, type IndexRowData } from "@/features/browse/kit";
import { num, plural, yearRange } from "@/lib/format";
import { href, useOpen } from "@/lib/links";

type Scope = "all" | "current" | "champions" | "winners";
type Sort = "latest" | "wins" | "titles" | "podiums" | "poles" | "starts" | "points" | "name";

const SORTS: { value: Sort; label: string }[] = [
	{ value: "latest", label: "Latest" },
	{ value: "wins", label: "Wins" },
	{ value: "titles", label: "Titles" },
	{ value: "podiums", label: "Podiums" },
	{ value: "poles", label: "Poles" },
	{ value: "starts", label: "Starts" },
	{ value: "points", label: "Points" },
	{ value: "name", label: "Name" },
];

const UNIT: Record<"wins" | "podiums" | "poles" | "starts", string> = { wins: "win", podiums: "podium", poles: "pole", starts: "start" };

export function DriversScreen() {
	const { rows, current } = useView((db) => ({ rows: driversView(db).rows, current: activeGrid(db)?.drivers ?? new Set<string>() }), []);
	const open = useOpen();
	const [query, setQuery] = useState("");
	const [scope, setScope] = useState<Scope>("all");
	const [decade, setDecade] = useState("all");
	const [sort, setSort] = useState<Sort>("latest");
	const list = useMemo<IndexRowData[]>(() => {
		const match = matcher(query);
		const out = rows.filter(
			(r) =>
				match(r.driver.name) &&
				inDecade(decade, r.firstYear, r.lastYear) &&
				(scope === "all" || (scope === "current" && current.has(r.driver.id)) || (scope === "champions" && r.titles > 0) || (scope === "winners" && r.wins > 0)),
		);
		if (sort === "name") out.sort((a, b) => a.driver.name.localeCompare(b.driver.name));
		else if (sort !== "latest") out.sort((a, b) => b[sort] - a[sort] || b.wins - a.wins || b.starts - a.starts);
		const key = sort === "latest" || sort === "name" || sort === "titles" ? "wins" : sort;
		return out.map((r) => ({
			key: r.driver.id,
			flag: r.driver.country,
			title: r.driver.name,
			subtitle: yearRange(r.firstYear, r.lastYear),
			titles: r.titles,
			value: key === "points" ? `${num(r.points)} pts` : r[key] ? plural(r[key], UNIT[key]) : "",
			onPress: () => open(href.driver(r.driver.id)),
		}));
	}, [rows, current, query, scope, decade, sort, open]);
	return (
		<IndexScreen
			title="Drivers"
			subtitle={`${num(rows.length)} World Championship drivers`}
			query={query}
			onQuery={setQuery}
			placeholder="Search drivers"
			rows={list}
			header={
				<>
					<ChoiceChips<Scope>
						value={scope}
						onChange={setScope}
						options={[
							{ value: "all", label: "Everyone" },
							{ value: "current", label: "Current" },
							{ value: "champions", label: "Champions" },
							{ value: "winners", label: "Winners" },
						]}
					/>
					<ChoiceChips value={decade} onChange={setDecade} options={decadeOptions} />
					<ChoiceChips<Sort> value={sort} onChange={setSort} options={SORTS} />
				</>
			}
		/>
	);
}
