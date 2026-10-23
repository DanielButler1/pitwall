import { useMemo, useState } from "react";
import { enginesView, tyresView, type SupplierKind } from "@pitwall/core/f1/views";
import { ChoiceChips, IndexScreen, matcher, type IndexRowData } from "@/features/browse/kit";
import { useView } from "@/data/dataset";
import { plural, yearRange } from "@/lib/format";
import { href, useOpen } from "@/lib/links";

type Sort = "wins" | "races" | "titles" | "latest" | "name";

export const SUPPLIER = {
	engine: { title: "Engines", one: "Engine", count: "manufacturers", placeholder: "Search engines" },
	tyre: { title: "Tyres", one: "Tyre supplier", count: "suppliers", placeholder: "Search tyre suppliers" },
} as const;

function SuppliersScreen({ kind }: { kind: SupplierKind }) {
	const rows = useView((db) => (kind === "engine" ? enginesView(db) : tyresView(db)).rows, [kind]);
	const open = useOpen();
	const [query, setQuery] = useState("");
	const [sort, setSort] = useState<Sort>("wins");
	const list = useMemo<IndexRowData[]>(() => {
		const match = matcher(query);
		const out = rows.filter((r) => match(r.supplier.name) || match(r.nation.name));
		if (sort === "races") out.sort((a, b) => b.races - a.races);
		if (sort === "titles") out.sort((a, b) => b.driversTitles - a.driversTitles || b.constructorsTitles - a.constructorsTitles || b.wins - a.wins);
		if (sort === "latest") out.sort((a, b) => (b.lastYear ?? 0) - (a.lastYear ?? 0) || b.wins - a.wins);
		if (sort === "name") out.sort((a, b) => a.supplier.name.localeCompare(b.supplier.name));
		const value = (r: (typeof rows)[number]) => (sort === "races" ? plural(r.races, "race") : sort === "titles" ? plural(r.constructorsTitles, "constructors' title", "constructors' titles") : plural(r.wins, "win"));
		return out.map((r) => ({
			key: r.supplier.id,
			flag: r.supplier.country,
			title: r.supplier.name,
			subtitle: [yearRange(r.firstYear, r.lastYear), r.driversTitles ? plural(r.driversTitles, "drivers' title", "drivers' titles") : null].filter(Boolean).join(" · "),
			value: value(r),
			onPress: () => open(kind === "engine" ? href.engine(r.supplier.id) : href.tyre(r.supplier.id)),
		}));
	}, [rows, query, sort, open, kind]);
	const s = SUPPLIER[kind];
	return (
		<IndexScreen
			title={s.title}
			subtitle={`${rows.length} ${s.count}`}
			query={query}
			onQuery={setQuery}
			placeholder={s.placeholder}
			rows={list}
			header={
				<ChoiceChips<Sort>
					value={sort}
					onChange={setSort}
					options={[
						{ value: "wins", label: "Wins" },
						{ value: "races", label: "Races" },
						{ value: "titles", label: "Titles" },
						{ value: "latest", label: "Latest" },
						{ value: "name", label: "Name" },
					]}
				/>
			}
		/>
	);
}

export const EnginesScreen = () => <SuppliersScreen kind="engine" />;
export const TyresScreen = () => <SuppliersScreen kind="tyre" />;
