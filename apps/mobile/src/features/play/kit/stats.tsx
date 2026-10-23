// A game's stats as a sheet over the screen: played, win %, streak, best streak, and a bar per
// distribution bucket (today's result highlighted).

import { X } from "lucide-react-native";
import type { ReactNode } from "react";
import { Modal, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { currentStreak, type GameStats } from "@pitwall/core/game/daily";
import { IconButton, Text } from "@/components/ui";
import { cn } from "@/lib/cn";
import { num } from "@/lib/format";

/** The four headline figures for a game's stats. */
export function statFigures(stats: GameStats, today: number | null): [string, string][] {
	return [
		["Played", num(stats.played)],
		["Win %", String(stats.played ? Math.round((stats.won / stats.played) * 100) : 0)],
		["Streak", String(today == null ? stats.streak : currentStreak(stats, today))],
		["Best streak", String(stats.maxStreak)],
	];
}

export function StatsPanel({
	open,
	onClose,
	stats,
	today,
	description,
	distributionTitle = "Guess distribution",
	distributionLabel = "Wins by number of guesses",
	bucketLabel = (i) => String(i + 1),
	bucketSrLabel = (i) => `wins in ${i + 1}`,
	labelWidth = 14,
	highlight,
	children,
}: {
	open: boolean;
	onClose: () => void;
	stats: GameStats;
	today: number | null;
	description: string;
	distributionTitle?: string;
	/** Accessible name of the distribution. */
	distributionLabel?: string;
	bucketLabel?: (i: number) => string;
	/** Screen-reader text after a bucket's count, e.g. "wins in 3". */
	bucketSrLabel?: (i: number) => string;
	/** Width (dp) of the bucket label column; widen it for labels longer than one digit. */
	labelWidth?: number;
	/** The bucket of today's result, or null. */
	highlight: number | null;
	/** Anything extra under the distribution (a game's own records). */
	children?: ReactNode;
}) {
	const insets = useSafeAreaInsets();
	const max = Math.max(1, ...stats.distribution);
	return (
		<Modal visible={open} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
			<View className="flex-1 justify-end">
				<Pressable accessibilityLabel="Close stats" className="absolute inset-0 bg-black/40" onPress={onClose} />
				<View className="max-h-[85%] rounded-t-2xl border-t border-border bg-background" style={{ paddingBottom: insets.bottom + 12 }}>
					<View className="flex-row items-start gap-2 pl-4 pr-2 pt-3">
						<View className="flex-1 pt-1.5">
							<Text variant="title" accessibilityRole="header">
								Your stats
							</Text>
							<Text variant="muted" className="mt-0.5">
								{description}
							</Text>
						</View>
						<IconButton icon={X} label="Close" onPress={onClose} />
					</View>
					<ScrollView contentContainerClassName="px-4 pb-2 pt-4">
						<View className="flex-row">
							{statFigures(stats, today).map(([label, v]) => (
								<View key={label} className="flex-1 items-center" accessible accessibilityLabel={`${label}: ${v}`}>
									<Text variant="display" className="tabular-nums">
										{v}
									</Text>
									<Text variant="caption">{label}</Text>
								</View>
							))}
						</View>
						<Text variant="label" className="mt-6">
							{distributionTitle}
						</Text>
						<View className="mt-2 gap-1" accessibilityLabel={distributionLabel}>
							{stats.distribution.map((count, i) => (
								<View key={i} className="flex-row items-center gap-2" accessible accessibilityLabel={`${count} ${bucketSrLabel(i)}`}>
									<Text variant="caption" className="text-right tabular-nums" style={{ width: labelWidth }}>
										{bucketLabel(i)}
									</Text>
									<View className="flex-1">
										<View
											className={cn("h-6 min-w-7 items-end justify-center rounded-r-[4px] px-1.5", highlight === i ? "bg-primary" : "bg-muted")}
											style={{ width: `${(count / max) * 100}%` }}
										>
											<Text variant="caption" className={cn("font-semibold tabular-nums", highlight === i ? "text-primary-foreground" : "text-foreground")}>
												{count}
											</Text>
										</View>
									</View>
								</View>
							))}
						</View>
						{children}
					</ScrollView>
				</View>
			</View>
		</Modal>
	);
}
