// One record category (/records/<entity>/<family>/<variant>): the leaderboard, with the family's
// other variants as chips (they switch in place, like tabs), and the data-coverage note.

import { LegendList } from "@legendapp/list/react-native";
import { useLocalSearchParams } from "expo-router";
import { Trophy } from "lucide-react-native";
import { memo, useCallback, useState, type ReactElement } from "react";
import { Pressable, View } from "react-native";
import { recordCategoryView, type RecordRow } from "@pitwall/core/f1/records";
import { DetailScreen, Flag } from "@/components/f1";
import { Badge, EmptyState, ReadableWidth, Text } from "@/components/ui";
import { useView } from "@/data/dataset";
import { cn } from "@/lib/cn";
import { num } from "@/lib/format";
import { useOpen } from "@/lib/links";
import { cellCountry, cellsText, rowPath } from "./cells";
import { Callout, ChoiceChips } from "./kit";

type Row = RecordRow & { real?: string | null };

export function RecordCategoryScreen() {
	const { slug } = useLocalSearchParams<{ slug: string | string[] }>();
	const initial = (Array.isArray(slug) ? slug : [slug ?? ""]).map(decodeURIComponent).join("/");
	const [id, setId] = useState(initial);
	const view = useView((db) => recordCategoryView(db, id), [id]);
	const open = useOpen();
	const renderItem = useCallback(({ item }: { item: Row }) => <RecordRowView row={item} onOpen={open} />, [open]);

	if (!view)
		return (
			<DetailScreen title="Records">
				<EmptyState icon={Trophy} title="No such record" body="It may have been renamed. Find it in the Records tab." />
			</DetailScreen>
		);
	const { meta } = view;

	const header: ReactElement = (
		<View className="pb-2">
			<Text variant="muted" className="px-4 pt-1">{meta.description}</Text>
			{view.siblings.length > 1 ? (
				<ChoiceChips className="mt-3" value={meta.id} onChange={setId} options={view.siblings.map((s) => ({ value: s.id, label: s.title }))} />
			) : null}
			{meta.coverage ? (
				<Callout className="mt-3" title={`Data coverage: ${meta.coverage.label}`}>
					{meta.coverage.note}
					{view.excludedRaces ? ` ${view.excludedRaces} race${view.excludedRaces === 1 ? "" : "s"} this universe changed ${view.excludedRaces === 1 ? "is" : "are"} left out: their real lap data no longer matches the results.` : ""}
				</Callout>
			) : null}
			{view.rows.length ? (
				<View className="mt-4 flex-row items-center gap-3 border-b border-border pb-1.5 pl-4 pr-4">
					<Text variant="caption" className="w-8">#</Text>
					<Text variant="caption" className="flex-1">{meta.columns.detail ? `${meta.columns.subject} · ${meta.columns.detail}` : meta.columns.subject}</Text>
					<Text variant="caption">{meta.columns.value}</Text>
				</View>
			) : null}
		</View>
	);

	const footer = view.rows.length ? (
		<Text variant="caption" className="px-4 pt-3">
			{view.total > view.rows.length ? `Top ${num(view.rows.length)} of ${num(view.total)}` : `${num(view.total)} in all`}
		</Text>
	) : null;

	return (
		<DetailScreen title={`${meta.family}: ${meta.title}`} subtitle={`Records · ${view.entityLabel}`}>
			<ReadableWidth className="flex-1">
				<LegendList
					key={meta.id}
					data={view.rows}
					renderItem={renderItem}
					keyExtractor={(r) => r.key}
					estimatedItemSize={60}
					recycleItems
					ListHeaderComponent={header}
					ListFooterComponent={footer}
					ListEmptyComponent={<EmptyState icon={Trophy} title="No one holds this record yet" />}
					contentContainerStyle={{ paddingBottom: 40 }}
				/>
			</ReadableWidth>
		</DetailScreen>
	);
}

const RecordRowView = memo(function RecordRowView({ row, onOpen }: { row: Row; onOpen(path: string): void }) {
	const path = rowPath(row.subject, row.detail);
	const subject = cellsText(row.subject, "  ");
	const detail = cellsText(row.detail);
	const country = row.subject.map(cellCountry).find(Boolean) ?? null;
	const body = (
		<>
			<Text variant="small" className={cn("w-8 tabular-nums", row.rank <= 3 ? "font-semibold text-foreground" : "text-muted-foreground")}>{row.rank}</Text>
			<View className={cn("min-h-[52px] flex-1 flex-row items-center gap-3 border-b border-border py-2.5")}>
				<View className="flex-1">
					<View className="flex-row items-center gap-1.5">
						{country ? <Flag code={country} /> : null}
						<Text variant="body" className="shrink font-semibold" numberOfLines={2}>{subject}</Text>
					</View>
					{detail ? <Text variant="caption" className="mt-0.5" numberOfLines={3}>{detail}</Text> : null}
				</View>
				<View className="max-w-[40%] items-end">
					<Text variant={row.date ? "small" : "label"} className="text-right tabular-nums">{row.display}</Text>
					{row.real != null ? <Badge label={`real ${row.real}`} tone="primary" /> : null}
				</View>
			</View>
		</>
	);
	const box = "flex-row items-center gap-3 pl-4 pr-4";
	if (!path) return <View className={box}>{body}</View>;
	return (
		<Pressable accessibilityRole="button" accessibilityLabel={`${row.rank}. ${subject}, ${row.display}${detail ? `, ${detail}` : ""}`} onPress={() => onOpen(path)} className={cn(box, "active:bg-accent")}>
			{body}
		</Pressable>
	);
});
