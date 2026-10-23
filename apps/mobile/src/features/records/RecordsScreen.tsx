// The Records tab: the diary, milestones, compare and points systems up top, the headline record
// holders, then every record category (the website's /records), by entity and family, searchable.

import { LegendList } from "@legendapp/list/react-native";
import { Calculator, CalendarDays, GitCompareArrows, Target } from "lucide-react-native";
import { memo, useCallback, useMemo, useState, type ReactElement } from "react";
import { View } from "react-native";
import { MONTHS, diarySlug } from "@pitwall/core/f1/diary";
import { recordsIndexView, type EntityKind, type RecordMeta, type RecordPageView } from "@pitwall/core/f1/records";
import { Flag, TabScreen } from "@/components/f1";
import { Badge, EmptyState, ReadableWidth, Row, SearchField, Section, Text } from "@/components/ui";
import { useView } from "@/data/dataset";
import { href, useOpen } from "@/lib/links";
import { cellCountry, cellText } from "./cells";
import { ChoiceChips, today } from "./kit";

type Item =
	| { type: "family"; key: string; title: string; coverage?: string }
	| { type: "record"; key: string; meta: RecordMeta; label: string; coverage?: string; last: boolean }
	| { type: "notes"; key: string; notes: { label: string; note: string }[] };

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** "Most wins by a driver": a headline leaderboard's title. */
function headline(v: RecordPageView) {
	const what = v.meta.family === "Grands Prix" ? "Grands Prix" : v.meta.family === "Championships" ? "titles" : v.meta.family.toLowerCase();
	return `Most ${what}, ${v.meta.entity === "constructor" ? "constructors" : "drivers"}`;
}

/** A list's coverage notes, written out once each (phones can't hover the badges). */
function notesOf(records: RecordMeta[]) {
	return [...new Map(records.flatMap((r) => (r.coverage ? [[r.coverage.label, r.coverage] as const] : []))).values()];
}

export function RecordsScreen() {
	const view = useView((db) => recordsIndexView(db), []);
	const open = useOpen();
	const [entity, setEntity] = useState<EntityKind>("driver");
	const [query, setQuery] = useState("");
	const now = today();

	const items = useMemo<Item[]>(() => {
		const out: Item[] = [];
		const q = fold(query.trim());
		if (q) {
			const words = q.split(/\s+/);
			for (const s of view.sections) {
				const found = s.families.flatMap((f) => f.records).filter((m) => {
					const text = fold(`${s.label} ${m.family} ${m.title} ${m.description}`);
					return words.every((w) => text.includes(w));
				});
				if (!found.length) continue;
				out.push({ type: "family", key: `s:${s.entity}`, title: s.label });
				found.forEach((m, i) => out.push({ type: "record", key: m.id, meta: m, label: `${m.family}: ${m.title}`, coverage: m.coverage?.label, last: i === found.length - 1 }));
				const notes = notesOf(found);
				if (notes.length) out.push({ type: "notes", key: `n:${s.entity}`, notes });
			}
			return out;
		}
		const section = view.sections.find((s) => s.entity === entity);
		for (const f of section?.families ?? []) {
			// a family whose every category shares one coverage (laps led) shows it once, on its heading
			const first = f.records[0]?.coverage?.label;
			const shared = first && f.records.every((r) => r.coverage?.label === first) ? first : undefined;
			out.push({ type: "family", key: `f:${f.family}`, title: f.family, coverage: shared });
			f.records.forEach((m, i) => out.push({ type: "record", key: m.id, meta: m, label: m.title, coverage: shared ? undefined : m.coverage?.label, last: i === f.records.length - 1 }));
			const notes = notesOf(f.records);
			if (notes.length) out.push({ type: "notes", key: `n:${f.family}`, notes });
		}
		return out;
	}, [view.sections, entity, query]);

	const renderItem = useCallback(({ item }: { item: Item }) => <ItemView item={item} onOpen={open} />, [open]);

	const header: ReactElement = (
		<View>
			<Section className="mt-2">
				<Row icon={CalendarDays} title="Diary" subtitle={`Today, ${now.day} ${MONTHS[now.month - 1]}: races, birthdays and titles on every date`} onPress={() => open(href.diary(diarySlug(now.month, now.day)))} />
				<Row icon={Target} title="Milestone watch" subtitle="Round numbers and record chases for the current grid" onPress={() => open("/milestones")} />
				<Row icon={GitCompareArrows} title="Compare" subtitle="Two to four drivers or constructors side by side" onPress={() => open("/compare")} />
				<Row icon={Calculator} title="Points systems" subtitle="Every season re-scored, or build your own" onPress={() => open("/points")} last />
			</Section>
			<Section title="Record holders" description="Formula 1 World Championship, since 1950">
				{view.highlights.map((h, i) => (
					<Highlight key={h.meta.id} view={h} last={i === view.highlights.length - 1} onOpen={open} />
				))}
			</Section>
			<Section title="All categories" description="From every World Championship result (F1DB), with laps led and other lap-by-lap records from Jolpica since 1996.">
				<SearchField value={query} onChangeText={setQuery} placeholder="Search, e.g. youngest, Monaco" className="mx-4 mt-2" />
				{query.trim() ? (
					<Text variant="caption" className="px-4 pt-2">{`${items.filter((x) => x.type === "record").length} found`}</Text>
				) : (
					<ChoiceChips className="mt-3" value={entity} onChange={setEntity} options={view.sections.map((s) => ({ value: s.entity, label: s.label }))} />
				)}
			</Section>
		</View>
	);

	return (
		<TabScreen title="Records">
			<ReadableWidth className="flex-1">
				<LegendList
					data={items}
					renderItem={renderItem}
					keyExtractor={(x) => x.key}
					getItemType={(x) => x.type}
					estimatedItemSize={52}
					recycleItems
					keyboardShouldPersistTaps="handled"
					keyboardDismissMode="on-drag"
					ListHeaderComponent={header}
					ListEmptyComponent={<EmptyState title={`No records match "${query.trim()}"`} />}
					contentContainerStyle={{ paddingBottom: 40 }}
				/>
			</ReadableWidth>
		</TabScreen>
	);
}

const ItemView = memo(function ItemView({ item, onOpen }: { item: Item; onOpen(path: string): void }) {
	if (item.type === "family")
		return (
			<View className="mt-5 flex-row items-center gap-2 px-4 pb-1">
				<Text variant="heading">{item.title}</Text>
				{item.coverage ? <Badge label={item.coverage} /> : null}
			</View>
		);
	if (item.type === "notes")
		return (
			<View className="gap-1 px-4 pt-2">
				{item.notes.map((n) => (
					<Text key={n.label} variant="caption" className="leading-[17px]">
						<Text variant="caption" className="font-semibold text-foreground">{`${n.label}: `}</Text>
						{n.note}
					</Text>
				))}
			</View>
		);
	return (
		<Row
			title={item.label}
			numberOfLines={2}
			trailing={item.coverage ? <Badge label={item.coverage} /> : undefined}
			onPress={() => onOpen(href.record(item.meta.id))}
			last={item.last}
		/>
	);
});

function Highlight({ view, last, onOpen }: { view: RecordPageView; last: boolean; onOpen(path: string): void }) {
	const top = view.rows.filter((r) => r.rank === 1);
	const lead = top[0];
	const names = top.map((r) => r.subject.map(cellText).join(" ")).join(", ");
	return (
		<Row
			title={names || "No one yet"}
			subtitle={headline(view)}
			leading={<View className="w-7 items-center">{lead ? <Flag code={cellCountry(lead.subject[0]!)} /> : null}</View>}
			value={lead ? lead.display : null}
			onPress={() => onOpen(href.record(view.meta.id))}
			last={last}
		/>
	);
}
