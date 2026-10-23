// Pitwall's own building blocks on top of the ui kit, the mobile counterparts of
// apps/web/src/components/f1.tsx: flags, position badges, stat tiles, the scrolling page and the
// tab-root header.

import { useRouter } from "expo-router";
import { Search, Settings } from "lucide-react-native";
import type { ReactNode } from "react";
import { Pressable, ScrollView, View, type ScrollViewProps } from "react-native";
import { IconButton, Header, ReadableWidth, Screen, Text } from "@/components/ui";
import { cn } from "@/lib/cn";
import { flagEmoji } from "@/lib/format";

/** A country's flag (ISO alpha-2), drawn as an emoji; nothing for an unknown code. */
export function Flag({ code, className }: { code: string | null | undefined; className?: string }) {
	const emoji = flagEmoji(code);
	if (!emoji) return null;
	return (
		<Text className={cn("text-[15px]", className)} accessible={false}>
			{emoji}
		</Text>
	);
}

const PODIUM: Record<string, string> = { "1": "bg-gold/25", "2": "bg-silver/30", "3": "bg-bronze/25" };

/** A finishing position or classification ("1", "DNF"), gold, silver and bronze for the podium. */
export function Pos({ text, className }: { text: string; className?: string }) {
	return (
		<View className={cn("h-6 min-w-7 items-center justify-center rounded-md px-1.5", PODIUM[text] ?? "bg-muted/60", className)}>
			<Text variant="caption" className={cn("tabular-nums", PODIUM[text] ? "font-semibold text-foreground" : "text-muted-foreground")}>
				{text}
			</Text>
		</View>
	);
}

// Two to a row: each tile starts just under half the width and grows to fill it. (Styles rather than
// classes: Uniwind didn't lay these out as a wrapping row.)
const GRID = { flexDirection: "row", flexWrap: "wrap", gap: 8 } as const;
const TWO_UP = { flexBasis: "45%", flexGrow: 1 } as const;

/** Two-column stat tiles (titles, wins, poles…): label above, value below. */
export function StatGrid({ children, className }: { children: ReactNode; className?: string }) {
	return (
		<View className={cn("px-4", className)} style={GRID}>
			{children}
		</View>
	);
}

export function Stat({ label, value, detail, onPress }: { label: string; value: ReactNode; detail?: string | null; onPress?: () => void }) {
	const body = (
		<>
			<Text variant="caption">{label}</Text>
			{typeof value === "string" || typeof value === "number" ? (
				<Text variant="title" className="mt-1 tabular-nums" numberOfLines={1} adjustsFontSizeToFit>
					{value}
				</Text>
			) : (
				<View className="mt-1">{value}</View>
			)}
			{detail ? (
				<Text variant="caption" className="mt-0.5" numberOfLines={1}>
					{detail}
				</Text>
			) : null}
		</>
	);
	const box = "rounded-md border border-border px-3 py-2.5";
	return onPress ? (
		<Pressable accessibilityRole="button" onPress={onPress} className={cn(box, "active:bg-accent")} style={TWO_UP}>
			{body}
		</Pressable>
	) : (
		<View className={box} style={TWO_UP}>
			{body}
		</View>
	);
}

/**
 * A screen's scrolling body: readable width on tablets and room under the last row. (No
 * pull-to-refresh: its spinner is the system's, and the app checks for new data by itself on
 * launch and on return; Settings has a check button.)
 */
export function Page({ children, ...props }: ScrollViewProps & { children: ReactNode }) {
	return (
		<ScrollView contentContainerClassName="pb-10" keyboardShouldPersistTaps="handled" {...props}>
			<ReadableWidth>{children}</ReadableWidth>
		</ScrollView>
	);
}

/** A tab's root: large title, with search and settings always to hand. */
export function TabScreen({ title, subtitle, children, right }: { title: string; subtitle?: string | null; children: ReactNode; right?: ReactNode }) {
	const router = useRouter();
	return (
		<Screen>
			<Header
				title={title}
				subtitle={subtitle}
				large
				right={
					<>
						{right}
						<IconButton icon={Search} label="Search" onPress={() => router.push("/search")} />
						<IconButton icon={Settings} label="Settings" onPress={() => router.push("/settings")} />
					</>
				}
			/>
			{children}
		</Screen>
	);
}

/** A pushed screen: back arrow and title, with search to hand. */
export function DetailScreen({ title, subtitle, children, right }: { title: string; subtitle?: string | null; children: ReactNode; right?: ReactNode }) {
	const router = useRouter();
	return (
		<Screen>
			<Header
				title={title}
				subtitle={subtitle}
				back
				right={
					<>
						{right}
						<IconButton icon={Search} label="Search" onPress={() => router.push("/search")} />
					</>
				}
			/>
			{children}
		</Screen>
	);
}
