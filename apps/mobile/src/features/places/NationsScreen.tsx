import { useMemo, useState } from "react";
import { nationsView } from "@pitwall/core/f1/views";
import { ChoiceChips, IndexScreen, matcher, type IndexRowData } from "@/features/browse/kit";
import { useView } from "@/data/dataset";
import { plural } from "@/lib/format";
import { href, useOpen } from "@/lib/links";

type Sort = "titles" | "wins" | "drivers" | "hosted" | "name";

export function NationsScreen() {
	const rows = useView((db) => nationsView(db).rows, []);
	const open = useOpen();
	const [query, setQuery] = useState("");
	const [sort, setSort] = useState<Sort>("titles");
	const list = useMemo<IndexRowData[]>(() => {
		const match = matcher(query);
		const out = rows.filter((r) => match(r.nation.name));
		if (sort === "wins") out.sort((a, b) => b.wins - a.wins || b.drivers - a.drivers);
		if (sort === "drivers") out.sort((a, b) => b.drivers - a.drivers || b.wins - a.wins);
		if (sort === "hosted") out.sort((a, b) => b.racesHosted - a.racesHosted || b.circuits - a.circuits);
		if (sort === "name") out.sort((a, b) => a.nation.name.localeCompare(b.nation.name));
		const value = (r: (typeof rows)[number]) =>
			sort === "wins" ? plural(r.wins, "win") : sort === "drivers" ? plural(r.drivers, "driver") : sort === "hosted" ? plural(r.racesHosted, "race") : r.titles ? plural(r.titles, "title") : null;
		return out.map((r) => ({
			key: r.nation.id,
			flag: r.nation.country,
			title: r.nation.name,
			subtitle: [r.drivers ? plural(r.drivers, "driver") : null, r.wins ? plural(r.wins, "win") : null, r.racesHosted ? `${plural(r.racesHosted, "race")} hosted` : null, !r.drivers && r.constructors ? plural(r.constructors, "constructor") : null].filter(Boolean).join(" · "),
			value: value(r),
			onPress: () => open(href.nation(r.nation.id)),
		}));
	}, [rows, query, sort, open]);
	return (
		<IndexScreen
			title="Nations"
			subtitle={`${rows.length} countries`}
			query={query}
			onQuery={setQuery}
			placeholder="Search countries"
			rows={list}
			header={
				<ChoiceChips<Sort>
					value={sort}
					onChange={setSort}
					options={[
						{ value: "titles", label: "Titles" },
						{ value: "wins", label: "Wins" },
						{ value: "drivers", label: "Drivers" },
						{ value: "hosted", label: "Races hosted" },
						{ value: "name", label: "Name" },
					]}
				/>
			}
		/>
	);
}
