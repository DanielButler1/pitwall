// The strip above the tab bar while the app shows a Lab universe (the website's universe banner):
// which universe, how far it has got building, "What changed" and "Back to reality".

import { GitCompareArrows, Sparkles, X } from "lucide-react-native";
import { useEffect } from "react";
import { Pressable, View } from "react-native";
import { Icon, IconButton, Text } from "@/components/ui";
import { universeSlot } from "@/data/dataset";
import { plural } from "@/lib/format";
import { haptic } from "@/lib/haptics";
import { useOpenInCurrentTab } from "@/lib/links";
import { modeStore, startUniverseMode } from "../engine/mode";
import { enteredStore, leaveUniverse, useUniverse } from "../engine/store";

export function UniverseBanner() {
	useEffect(startUniverseMode, []);
	const id = enteredStore.use();
	const universe = useUniverse(id ?? undefined);
	const mode = modeStore.use();
	const slot = universeSlot.use();
	const open = useOpenInCurrentTab();
	if (!id || !universe) return null;

	const seasons = slot?.id === id ? (slot.db.modifiedYears?.size ?? 0) : null;
	const status =
		mode.status === "building"
			? mode.progress
				? `${mode.progress.label}${mode.progress.fraction != null ? ` · ${Math.round(mode.progress.fraction * 100)}%` : ""}`
				: "Building this universe"
			: mode.status === "error"
				? `Couldn’t build it: ${mode.message}`
				: `${universe.shared ? "Shared · " : ""}${plural(universe.changes.length, "change")}${seasons != null ? ` · ${plural(seasons, "season")} affected` : ""}`;
	return (
		<View className="flex-row items-center gap-1 border-t border-universe/30 bg-universe/10 pl-4 pr-1">
			<Pressable
				accessibilityRole="button"
				accessibilityLabel={`Showing the universe ${universe.name}. Open it in the Lab`}
				onPress={() => open(`/lab/${id}`)}
				className="min-h-[52px] flex-1 flex-row items-center gap-2.5 py-1.5"
			>
				<Icon icon={Sparkles} tone="universe" size={18} />
				<View className="flex-1">
					<Text variant="label" numberOfLines={1} className="text-universe">
						{universe.name}
					</Text>
					<Text variant="caption" numberOfLines={1}>
						{status}
					</Text>
				</View>
			</Pressable>
			<IconButton icon={GitCompareArrows} label="What changed" onPress={() => open(`/changes?u=${id}`)} />
			<IconButton
				icon={X}
				label="Back to reality"
				onPress={() => {
					haptic("toggleOff");
					leaveUniverse();
				}}
			/>
		</View>
	);
}
