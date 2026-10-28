// The guess picker: a search field with the matching names listed straight under it (in the
// page, so the list has the screen's height to itself while the keyboard is up). Options show the
// name alone: a flag, years or a team would answer the games' clues.

import { useMemo, useRef, useState, type ComponentRef } from "react";
import { Keyboard, Pressable, TextInput, useWindowDimensions, View, type KeyboardTypeOptions } from "react-native";
import { searchByName } from "@pitwall/core/game/daily";
import { SearchField, Text } from "@/components/ui";
import { cn } from "@/lib/cn";
import { useGameScroll } from "./screen";

/**
 * Something to pick: `label` is searched; a higher `weight` ranks first among equal matches.
 * `sublabel` only tells apart items sharing a label, so it is shown for those alone.
 */
export type PickerItem = { id: string; label: string; sublabel?: string; weight?: number };

export function EntityPicker<T extends PickerItem>({
	items,
	exclude,
	onPick,
	label,
	placeholder,
	noun,
	search,
	showAllOnFocus = false,
	limit = 8,
	keyboardType,
	maxLength,
	sanitize,
	disabled,
	className,
}: {
	/** Keep memoised. */
	items: readonly T[];
	/** Ids never offered (e.g. already guessed). */
	exclude: readonly (string | number)[];
	onPick: (item: T) => void;
	/** The field's accessible name, e.g. "Guess a driver". */
	label: string;
	placeholder: string;
	/** Plural, e.g. "drivers": completes "No driver matches …". */
	noun: string;
	/** A custom search (e.g. years, races); defaults to name search over `label`. */
	search?: (items: readonly T[], query: string, exclude: ReadonlySet<string>) => T[];
	/** List every option as soon as the field is focused (a short list such as seasons). */
	showAllOnFocus?: boolean;
	limit?: number;
	keyboardType?: KeyboardTypeOptions;
	maxLength?: number;
	/** Cleans what's typed (e.g. digits only). */
	sanitize?: (text: string) => string;
	disabled?: boolean;
	className?: string;
}) {
	const [query, setQuery] = useState("");
	const [focused, setFocused] = useState(false);
	const input = useRef<ComponentRef<typeof TextInput>>(null);
	const box = useRef<ComponentRef<typeof View>>(null);
	const { bringToTop } = useGameScroll();
	const { height } = useWindowDimensions();
	const excluded = useMemo(() => new Set(exclude.map(String)), [exclude]);
	const hits = useMemo(
		() => (search ? search(items, query, excluded) : searchByName(items, query, (d) => d.label, (d) => d.weight ?? 0, excluded, limit)),
		[items, query, excluded, search, limit],
	);
	const shared = useMemo(() => {
		const seen = new Set<string>();
		const twice = new Set<string>();
		for (const d of items) (seen.has(d.label) ? twice : seen).add(d.label);
		return twice;
	}, [items]);
	const show = focused && (query.trim().length > 0 || showAllOnFocus);
	const singular = noun.replace(/s$/, "");

	const pick = (d: T) => {
		setQuery("");
		input.current?.blur();
		Keyboard.dismiss();
		onPick(d);
	};

	return (
		<View ref={box} className={cn("px-4", className)}>
			<SearchField
				ref={input}
				value={query}
				onChangeText={(t) => setQuery(sanitize ? sanitize(t) : t)}
				placeholder={placeholder}
				accessibilityLabel={label}
				onFocus={() => {
					setFocused(true);
					// once the keyboard is up, lift the field to the top so the matches have room under it
					setTimeout(() => bringToTop(box.current), 250);
				}}
				onBlur={() => setFocused(false)}
				onSubmitEditing={() => hits[0] && query.trim() && pick(hits[0])}
				returnKeyType="done"
				keyboardType={keyboardType}
				maxLength={maxLength}
				editable={!disabled}
				spellCheck={false}
			/>
			{show ? (
				<View accessibilityRole="list" accessibilityLabel={noun[0]!.toUpperCase() + noun.slice(1)} className="mt-1">
					{hits.length ? (
						hits.map((d, i) => {
							const sub = d.sublabel != null && shared.has(d.label) ? d.sublabel : null;
							return (
								<Pressable
									key={d.id}
									accessibilityRole="button"
									accessibilityLabel={sub ? `${d.label}, ${sub}` : d.label}
									onPress={() => pick(d)}
									className={cn("min-h-12 flex-row items-center gap-3 px-1 active:bg-accent", i < hits.length - 1 && "border-b border-border")}
								>
									<Text variant="body" numberOfLines={1} className="flex-1 font-semibold">
										{d.label}
									</Text>
									{sub ? (
										<Text variant="caption" className="tabular-nums">
											{sub}
										</Text>
									) : null}
								</Pressable>
							);
						})
					) : (
						<Text variant="muted" className="px-1 py-3">
							No {singular} matches “{query.trim()}”
						</Text>
					)}
				</View>
			) : null}
			{/* while typing, room under the field so the page can keep it at the top however few matches there are */}
			{focused ? <View pointerEvents="none" style={{ height: Math.max(0, height * 0.7 - (show ? hits.length * 49 : 0)) }} /> : null}
		</View>
	);
}
