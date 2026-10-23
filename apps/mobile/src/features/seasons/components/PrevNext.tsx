import { ChevronLeft, ChevronRight } from "lucide-react-native";
import { Pressable, View } from "react-native";
import { Icon, Text } from "@/components/ui";

type Link = { label: string; caption: string; onPress(): void } | null;

/** Previous and next (season, race): two halves of one row, either may be missing. */
export function PrevNext({ prev, next }: { prev: Link; next: Link }) {
	if (!prev && !next) return null;
	return (
		<View className="mt-4 flex-row gap-2 px-4">
			{prev ? (
				<Pressable accessibilityRole="button" accessibilityLabel={`${prev.caption}: ${prev.label}`} onPress={prev.onPress} className="min-h-12 flex-1 flex-row items-center gap-1 rounded-md border border-border px-2 active:bg-accent">
					<Icon icon={ChevronLeft} tone="muted" size={18} />
					<View className="flex-1">
						<Text variant="caption">{prev.caption}</Text>
						<Text variant="label" numberOfLines={1}>{prev.label}</Text>
					</View>
				</Pressable>
			) : (
				<View className="flex-1" />
			)}
			{next ? (
				<Pressable accessibilityRole="button" accessibilityLabel={`${next.caption}: ${next.label}`} onPress={next.onPress} className="min-h-12 flex-1 flex-row items-center gap-1 rounded-md border border-border px-2 active:bg-accent">
					<View className="flex-1 items-end">
						<Text variant="caption">{next.caption}</Text>
						<Text variant="label" numberOfLines={1}>{next.label}</Text>
					</View>
					<Icon icon={ChevronRight} tone="muted" size={18} />
				</Pressable>
			) : (
				<View className="flex-1" />
			)}
		</View>
	);
}
