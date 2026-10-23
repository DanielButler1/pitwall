// The Lab's choices (a season, a race, a driver, a points system): a flat row showing the current
// choice, which opens a full-screen list, searchable when it's long.

import { LegendList } from "@legendapp/list/react-native";
import { Check, ChevronDown } from "lucide-react-native";
import { memo, useCallback, useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import { EmptyState, Icon, SearchField, Sheet, Text } from "@/components/ui";
import { cn } from "@/lib/cn";
import { haptic } from "@/lib/haptics";

export type Option<T> = { value: T; label: string; detail?: string; search?: string };

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function Picker<T extends string | number>({
	label,
	value,
	options,
	onChange,
	placeholder = "Choose",
	title,
	searchable,
	last,
}: {
	label: string;
	value: T | null;
	options: Option<T>[];
	onChange: (value: T) => void;
	placeholder?: string;
	/** The list's heading (defaults to the label). */
	title?: string;
	/** Defaults to on for lists longer than 12. */
	searchable?: boolean;
	last?: boolean;
}) {
	const [open, setOpen] = useState(false);
	const current = options.find((o) => o.value === value);
	return (
		<>
			<Pressable
				accessibilityRole="button"
				accessibilityLabel={`${label}: ${current?.label ?? placeholder}`}
				onPress={() => setOpen(true)}
				className="flex-row items-center pl-4 pr-3 active:bg-accent"
			>
				<View className={cn("min-h-[56px] flex-1 flex-row items-center gap-3 py-2.5", !last && "border-b border-border")}>
					<View className="flex-1">
						<Text variant="caption">{label}</Text>
						<Text variant="body" numberOfLines={1} className={cn("mt-0.5", current ? "font-semibold" : "text-muted-foreground")}>
							{current?.label ?? placeholder}
						</Text>
					</View>
					<Icon icon={ChevronDown} tone="muted" size={17} />
				</View>
			</Pressable>
			{open ? (
				<PickerSheet
					title={title ?? label}
					options={options}
					value={value}
					searchable={searchable ?? options.length > 12}
					onClose={() => setOpen(false)}
					onPick={(v) => {
						haptic("selection");
						setOpen(false);
						onChange(v);
					}}
				/>
			) : null}
		</>
	);
}

function PickerSheet<T extends string | number>({ title, options, value, searchable, onPick, onClose }: { title: string; options: Option<T>[]; value: T | null; searchable: boolean; onPick: (v: T) => void; onClose: () => void }) {
	const [query, setQuery] = useState("");
	const indexed = useMemo(() => options.map((o) => ({ o, s: fold(o.search ?? `${o.label} ${o.detail ?? ""}`) })), [options]);
	const hits = useMemo(() => {
		const words = fold(query.trim()).split(/\s+/).filter(Boolean);
		return words.length ? indexed.filter((x) => words.every((w) => x.s.includes(w))).map((x) => x.o) : options;
	}, [indexed, options, query]);
	// open at the current choice
	const initial = useMemo(() => Math.max(0, options.findIndex((o) => o.value === value)), [options, value]);
	const renderItem = useCallback(({ item }: { item: Option<T> }) => <OptionRow option={item} selected={item.value === value} onPick={onPick} />, [value, onPick]);
	return (
		<Sheet open onClose={onClose} title={title}>
				{searchable ? <SearchField value={query} onChangeText={setQuery} placeholder={`Search ${title.toLowerCase()}`} className="mx-4 mb-2" /> : null}
				<LegendList
					data={hits}
					renderItem={renderItem}
					keyExtractor={(o) => String(o.value)}
					estimatedItemSize={56}
					initialScrollIndex={query ? undefined : initial > 6 ? initial - 3 : undefined}
					recycleItems
					keyboardShouldPersistTaps="handled"
					keyboardDismissMode="on-drag"
					ListEmptyComponent={<EmptyState title="Nothing matches" />}
					contentContainerStyle={{ paddingBottom: 24 }}
				/>
		</Sheet>
	);
}

const OptionRow = memo(function OptionRow<T extends string | number>({ option, selected, onPick }: { option: Option<T>; selected: boolean; onPick: (v: T) => void }) {
	return (
		<Pressable accessibilityRole="button" accessibilityState={{ selected }} onPress={() => onPick(option.value)} className={cn("flex-row items-center gap-3 pl-4 pr-4 active:bg-accent", selected && "bg-accent")}>
			<View className="min-h-[52px] flex-1 flex-row items-center gap-3 border-b border-border py-2.5">
				<View className="flex-1">
					<Text variant="body" numberOfLines={2} className={cn(selected && "font-semibold")}>
						{option.label}
					</Text>
					{option.detail ? (
						<Text variant="caption" numberOfLines={2} className="mt-0.5">
							{option.detail}
						</Text>
					) : null}
				</View>
				{selected ? <Icon icon={Check} tone="primary" size={18} /> : null}
			</View>
		</Pressable>
	);
}) as <T extends string | number>(p: { option: Option<T>; selected: boolean; onPick: (v: T) => void }) => React.ReactElement;
