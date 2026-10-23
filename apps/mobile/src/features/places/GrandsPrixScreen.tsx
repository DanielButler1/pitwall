import { useMemo, useState } from "react";
import { grandsPrixView } from "@pitwall/core/f1/views";
import { ChoiceChips, IndexScreen, matcher, surname, type IndexRowData } from "@/features/browse/kit";
import { useView } from "@/data/dataset";
import { plural, yearRange } from "@/lib/format";
import { href, useOpen } from "@/lib/links";

type Sort = "races" | "latest" | "name";

export function GrandsPrixScreen() {
	const rows = useView((db) => grandsPrixView(db).rows, []);
	const open = useOpen();
	const [query, setQuery] = useState("");
	const [sort, setSort] = useState<Sort>("races");
	const list = useMemo<IndexRowData[]>(() => {
		const match = matcher(query);
		const out = rows.filter((r) => match(r.gp.name) || match(r.nation.name));
		if (sort === "latest") out.sort((a, b) => (b.lastYear ?? 9999) - (a.lastYear ?? 9999) || b.races - a.races);
		if (sort === "name") out.sort((a, b) => a.gp.name.localeCompare(b.gp.name));
		return out.map((r) => ({
			key: r.gp.id,
			flag: r.gp.country,
			title: r.gp.name,
			subtitle: [yearRange(r.firstYear, r.lastYear), r.topDriver ? `${surname(r.topDriver.driver.name)} ${r.topDriver.wins} ${r.topDriver.wins === 1 ? "win" : "wins"}` : null].filter(Boolean).join(" · "),
			value: r.races ? plural(r.races, "race") : "Upcoming",
			onPress: () => open(href.grandPrix(r.gp.id)),
		}));
	}, [rows, query, sort, open]);
	return (
		<IndexScreen
			title="Grands Prix"
			subtitle={`${rows.length} events`}
			query={query}
			onQuery={setQuery}
			placeholder="Search Grands Prix"
			rows={list}
			header={<ChoiceChips<Sort> value={sort} onChange={setSort} options={[{ value: "races", label: "Most races" }, { value: "latest", label: "Latest" }, { value: "name", label: "Name" }]} />}
		/>
	);
}
