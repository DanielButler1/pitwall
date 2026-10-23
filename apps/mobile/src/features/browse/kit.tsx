// Building blocks shared by the Browse screens (people and places): index lists, result cells,
// head-to-head bars, "show more" for long sections and small text helpers.

import { LegendList } from "@legendapp/list/react-native";
import { Trophy } from "lucide-react-native";
import { memo, useCallback, useState, type ReactElement, type ReactNode } from "react";
import { Pressable, View } from "react-native";
import { DetailScreen, Flag } from "@/components/f1";
import { Button, Chip, ChipRow, EmptyState, Icon, ReadableWidth, Row, SearchField, Segmented, Text } from "@/components/ui";
import { cn } from "@/lib/cn";
import { haptic } from "@/lib/haptics";
import { num } from "@/lib/format";

/* ----------------------------------------------------------------- text --- */

/** Last name for tight layouts: "Carlos Sainz Jr." -> "Sainz", "Elio de Angelis" -> "de Angelis". */
export function surname(name: string) {
	const words = name.replace(/ (Jr\.|Sr\.)$/, "").split(" ");
	let i = words.length - 1;
	while (i > 1 && /^(de|da|di|del|der|van|von|la|le|dos)$/.test(words[i - 1]!)) i--;
	return words.slice(i).join(" ");
}

/** "street" / "road" / "race": F1DB's circuit type and direction codes, in words. */
export const words = (code: string) => code.toLowerCase().replace(/_/g, "-").replace(/^./, (c) => c.toUpperCase());

/** "–" for a missing number, blank for zero in a ranking. */
export const countOrDash = (n: number | null | undefined) => (n == null ? "–" : num(n));

/* ---------------------------------------------------------- index lists --- */

export type IndexRowData = { key: string; flag?: string | null; title: string; subtitle?: string | null; value?: string | null; titles?: number; onPress?: () => void };

/** One entity in an index list: flag, name, years (and a gold trophy count), the key number. */
export const IndexRow = memo(function IndexRow({ row }: { row: IndexRowData }) {
	return (
		<Row
			leading={row.flag !== undefined ? <View className="w-6 items-center"><Flag code={row.flag} /></View> : undefined}
			title={row.title}
			subtitle={row.subtitle}
			value={row.value}
			trailing={row.titles ? <TitleCount n={row.titles} /> : undefined}
			onPress={row.onPress}
		/>
	);
});

/** A gold trophy and a count, standing in for a Titles column. */
export function TitleCount({ n }: { n: number }) {
	return (
		<View className="flex-row items-center gap-0.5" accessibilityLabel={`${n} ${n === 1 ? "title" : "titles"}`}>
			<Icon icon={Trophy} tone="gold" size={13} />
			<Text variant="caption" className="font-semibold text-gold tabular-nums">{n}</Text>
		</View>
	);
}

/**
 * A long index (drivers, constructors, ...) as a pushed screen: search and filters on top of a
 * virtualised list. `header` holds the filter controls; `count` reads "N shown".
 */
export function IndexScreen({ title, subtitle, query, onQuery, placeholder, header, rows, empty = "Nothing matches" }: { title: string; subtitle?: string; query: string; onQuery(q: string): void; placeholder: string; header?: ReactNode; rows: IndexRowData[]; empty?: string }) {
	const renderItem = useCallback(({ item }: { item: IndexRowData }) => <IndexRow row={item} />, []);
	const top: ReactElement = (
		<View className="gap-3 pb-1 pt-1">
			<SearchField value={query} onChangeText={onQuery} placeholder={placeholder} className="mx-4" />
			{header}
			<Text variant="caption" className="px-4">{num(rows.length)} shown</Text>
		</View>
	);
	return (
		<DetailScreen title={title} subtitle={subtitle}>
			<ReadableWidth className="flex-1">
				<LegendList
					data={rows}
					renderItem={renderItem}
					keyExtractor={(r) => r.key}
					estimatedItemSize={62}
					recycleItems
					keyboardShouldPersistTaps="handled"
					keyboardDismissMode="on-drag"
					ListHeaderComponent={top}
					ListEmptyComponent={<EmptyState title={empty} body="Try another search or filter." />}
					contentContainerStyle={{ paddingBottom: 40 }}
				/>
			</ReadableWidth>
		</DetailScreen>
	);
}

/** Matches a search box against a name, ignoring case and accents ("Raikkonen" finds Räikkönen). */
export function matcher(query: string) {
	const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
	const q = fold(query.trim());
	return (name: string) => !q || fold(name).includes(q);
}

/** A row of filter chips: one chosen at a time, with a selection haptic. */
export function ChoiceChips<T extends string>({ value, options, onChange }: { value: T; options: { value: NoInfer<T>; label: string }[]; onChange(v: T): void }) {
	return (
		<ChipRow>
			{options.map((o) => (
				<Chip
					key={o.value}
					// a no-break space: Android sometimes wraps a chip's two-word label inside its fixed height
					label={o.label.replace(/ /g, "\u00a0")}
					selected={o.value === value}
					onPress={() => {
						if (o.value === value) return;
						haptic("selection");
						onChange(o.value);
					}}
				/>
			))}
		</ChipRow>
	);
}

/** The kit's Segmented with the selection haptic, inset to the page margins. */
export function Switcher<T extends string>({ value, options, onChange, className }: { value: T; options: { value: NoInfer<T>; label: string }[]; onChange(v: T): void; className?: string }) {
	return (
		<Segmented
			className={cn("mx-4", className)}
			value={value}
			options={options}
			onChange={(v) => {
				if (v === value) return;
				haptic("selection");
				onChange(v);
			}}
		/>
	);
}

/** Decades a career (firstYear–lastYear) overlapped. */
export const DECADES = [1950, 1960, 1970, 1980, 1990, 2000, 2010, 2020];
export const decadeOptions = [{ value: "all", label: "All eras" }, ...DECADES.map((d) => ({ value: String(d), label: `${d}s` }))];
export const inDecade = (decade: string, first: number | null, last: number | null) => {
	if (decade === "all") return true;
	const d = Number(decade);
	return first != null && last != null && first <= d + 9 && last >= d;
};

/* ------------------------------------------------------- long sections --- */

/** How many rows of a long section to show, growing by `step`. */
export function useMore(initial: number, step = 50) {
	const [count, setCount] = useState(initial);
	return { count, more: () => setCount((c) => c + step), reset: () => setCount(initial) };
}

/** "Show 50 more" under a cut-off section; nothing when everything is shown. */
export function MoreButton({ shown, total, onPress, step = 50 }: { shown: number; total: number; onPress(): void; step?: number }) {
	if (shown >= total) return null;
	const left = total - shown;
	return <Button label={left <= step ? `Show all ${num(total)}` : `Show ${step} more of ${num(left)}`} variant="outline" size="sm" className="mx-4 mt-3 self-start" onPress={onPress} />;
}

/** A plain-text line under a section heading ("None yet."). */
export function Note({ children }: { children: ReactNode }) {
	return <Text variant="muted" className="px-4 py-2">{children}</Text>;
}

/** Ranked rows: position, flag and name, the count. */
export function Ranked<T>({ rows, title, flag, value, onPress, subtitle }: { rows: T[]; title(r: T): string; flag?(r: T): string | null; value(r: T): string; subtitle?(r: T): string | null; onPress?(r: T): void }) {
	if (!rows.length) return <Note>None yet.</Note>;
	return rows.map((r, i) => (
		<Row
			key={i}
			leading={
				<View className="w-11 flex-row items-center gap-1.5">
					<Text variant="caption" className="w-4 text-right tabular-nums">{i + 1}</Text>
					{flag ? <Flag code={flag(r)} /> : null}
				</View>
			}
			title={title(r)}
			subtitle={subtitle?.(r)}
			value={value(r)}
			onPress={onPress ? () => onPress(r) : undefined}
			last={i === rows.length - 1}
		/>
	));
}

/* --------------------------------------------------------- result cells --- */

const CELL_BG: Record<string, string> = { "1": "bg-gold/25", "2": "bg-silver/30", "3": "bg-bronze/25" };

/**
 * One race result as a small coloured cell, as in the website's season-by-season results: podium
 * colours, green for points, blue for a finish outside them, red for a retirement; pole underlined.
 */
export const ResultCell = memo(function ResultCell({ position, points, pole, label, onPress }: { position: string; points: number; pole: boolean; label: string; onPress?: () => void }) {
	const n = Number(position);
	const bg = CELL_BG[position] ?? (n > 3 && points > 0 ? "bg-points/20" : n > 3 ? "bg-finished/15" : "bg-retired/15");
	return (
		<Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} hitSlop={2} className={cn("h-7 min-w-7 items-center justify-center rounded-sm px-1 active:opacity-60", bg)}>
			<Text variant="caption" className={cn("text-[11px] tabular-nums", CELL_BG[position] ? "font-semibold text-foreground" : n ? "text-foreground" : "text-muted-foreground", pole && "underline")}>
				{position === "DNF" ? "R" : position}
			</Text>
		</Pressable>
	);
});

/* ------------------------------------------------------- head-to-heads --- */

/** Split bar for a head-to-head: the first driver's share in F1 red, the other side muted. */
export function DuelBar({ a, b, decimals, numWidth = 28, label }: { a: number; b: number; decimals?: boolean; numWidth?: number; label?: string }) {
	const total = a + b;
	const fmt = (n: number) => (decimals ? num(n) : String(n));
	return (
		<View className="flex-1 flex-row items-center gap-1.5" accessible accessibilityLabel={label ? `${label}: ${fmt(a)} to ${fmt(b)}` : `${fmt(a)} to ${fmt(b)}`}>
			<Text variant="caption" className={cn("text-right tabular-nums text-foreground", a > b && "font-semibold")} style={{ width: numWidth }}>{fmt(a)}</Text>
			<View className="h-2 flex-1 flex-row gap-0.5">
				{total > 0 ? (
					<>
						{a > 0 ? <View className="h-full rounded-l-full bg-primary" style={{ width: `${(a / total) * 100}%` }} /> : null}
						{b > 0 ? <View className="h-full flex-1 rounded-r-full bg-muted-foreground/35" /> : null}
					</>
				) : (
					<View className="h-full flex-1 rounded-full bg-muted" />
				)}
			</View>
			<Text variant="caption" className={cn("tabular-nums text-foreground", b > a && "font-semibold")} style={{ width: numWidth }}>{fmt(b)}</Text>
		</View>
	);
}

export const sharePct = (d: { a: number; b: number }) => (d.a + d.b ? `${Math.round((100 * d.a) / (d.a + d.b))}%` : "–");

/** A tappable inline link inside running text. */
export function InlineLink({ label, onPress, tone = "link" }: { label: string; onPress(): void; tone?: "link" | "plain" | "muted" }) {
	return (
		<Text variant="small" className={cn(tone === "link" ? "font-semibold text-link" : tone === "plain" ? "text-foreground" : "text-muted-foreground")} onPress={onPress} accessibilityRole="link" suppressHighlighting>
			{label}
		</Text>
	);
}
