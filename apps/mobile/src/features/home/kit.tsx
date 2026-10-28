// Small pieces the home page shares between its sections.

import { useRouter, type Href } from "expo-router";
import { ChevronRight, type LucideIcon } from "lucide-react-native";
import { useCallback, type ReactNode } from "react";
import { Pressable, View } from "react-native";
import { NAV_ITEMS } from "@/components/shell/navigation";
import { Icon, Text } from "@/components/ui";
import { cn } from "@/lib/cn";
import { useOpen } from "@/lib/links";

/** Website paths that are a tab's root: these switch tab rather than stacking a second copy. */
const TAB_ROOTS: Record<string, Href> = {
	"/": NAV_ITEMS[0]!.href as Href,
	"/browse": NAV_ITEMS[1]!.href as Href,
	"/records": NAV_ITEMS[2]!.href as Href,
	"/play": NAV_ITEMS[3]!.href as Href,
	"/lab": NAV_ITEMS[4]!.href as Href,
};

/** `useOpen`, except that a tab's root (/records, /play, /lab) switches to that tab. */
export function useGo() {
	const open = useOpen();
	const router = useRouter();
	return useCallback(
		(path: string) => {
			const tab = TAB_ROOTS[path];
			if (tab) router.navigate(tab);
			else open(path);
		},
		[open, router],
	);
}

/** The "Full result ›" link beside a section heading. */
export function MoreLink({ label, onPress }: { label: string; onPress: () => void }) {
	return (
		<Pressable accessibilityRole="link" accessibilityLabel={label} hitSlop={12} onPress={onPress} className="flex-row items-center gap-0.5 rounded-md py-1 active:opacity-60">
			<Text variant="small" className="font-semibold text-link">
				{label}
			</Text>
			<Icon icon={ChevronRight} tone="link" size={14} />
		</Pressable>
	);
}

// Two to a row, as the kit's StatGrid (percentage basis from a style: Uniwind didn't apply it from a class).
const GRID = { flexDirection: "row", flexWrap: "wrap", gap: 8 } as const;
const TWO_UP = { flexBasis: "45%", flexGrow: 1 } as const;

export function TileGrid({ children, className }: { children: ReactNode; className?: string }) {
	return (
		<View className={cn("px-4", className)} style={GRID}>
			{children}
		</View>
	);
}

/** A bordered link tile: an icon in a small square, a label and an optional detail line. */
export function Tile({ icon, label, detail, onPress, iconClassName, tone = "muted" }: { icon: LucideIcon; label: string; detail?: string; onPress: () => void; iconClassName?: string; tone?: "muted" | "primary" | "success" }) {
	return (
		<Pressable accessibilityRole="link" accessibilityLabel={detail ? `${label}, ${detail}` : label} onPress={onPress} className="min-h-14 flex-row items-center gap-2.5 rounded-md border border-border p-2.5 active:bg-accent" style={TWO_UP}>
			<View className={cn("h-8 w-8 items-center justify-center rounded-md", tone === "primary" ? "bg-primary/10" : tone === "success" ? "bg-success/15" : "bg-muted", iconClassName)}>
				<Icon icon={icon} tone={tone} size={16} />
			</View>
			<View className="flex-1">
				<Text variant="small" className="font-semibold" numberOfLines={2}>
					{label}
				</Text>
				{detail ? (
					<Text variant="caption" numberOfLines={2}>
						{detail}
					</Text>
				) : null}
			</View>
		</Pressable>
	);
}

/** A bold sub-heading inside a section ("Round numbers"). */
export function SubHeading({ icon, children }: { icon?: LucideIcon; children: string }) {
	return (
		<View className="mt-3 flex-row items-center gap-2 px-4 pb-1">
			{icon ? <Icon icon={icon} tone="muted" size={15} /> : null}
			<Text variant="label">{children}</Text>
		</View>
	);
}

/** Tappable name inside running text (a sentence with several links in it). */
export function InlineLink({ children, onPress, strong }: { children: string; onPress: () => void; strong?: boolean }) {
	return (
		<Text accessibilityRole="link" onPress={onPress} className={cn("text-link", strong && "font-semibold")}>
			{children}
		</Text>
	);
}
