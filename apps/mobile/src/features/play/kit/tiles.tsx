// Verdict tiles: the green / amber / grey clue cells every guessing game shares, their icons, a
// row of them under a guess (tap a tile to read what it means), and the legend.

import { ArrowDown, ArrowUp, Check, ChevronsDown, ChevronsUp, CircleDot, X, type LucideIcon } from "lucide-react-native";
import { createContext, useContext, useState, type ReactNode } from "react";
import { Pressable, View } from "react-native";
import Animated, { ZoomIn } from "react-native-reanimated";
import { useUniwind } from "uniwind";
import type { Direction, Verdict } from "@pitwall/core/game/daily";
import { Icon, Text } from "@/components/ui";
import type { IconTone } from "@/components/ui/icon";
import { cn } from "@/lib/cn";

/** Background and text classes per verdict (amber takes dark ink in both themes, as on the website). */
export const VERDICT_STYLE: Record<Verdict, { box: string; text: string }> = {
	match: { box: "bg-success", text: "text-primary-foreground" },
	close: { box: "bg-warning", text: "text-foreground dark:text-background" },
	miss: { box: "border border-border bg-muted", text: "text-foreground" },
};

/** The icon colour (a tone) for a verdict's tile in the current theme. */
export function useVerdictTone(verdict: Verdict): IconTone {
	const { theme } = useUniwind();
	if (verdict === "match") return "primary-foreground";
	if (verdict === "close") return theme === "dark" ? "background" : "foreground";
	return "foreground";
}

/** A tick, ↑/↓ when close, ⇈/⇊ when far, else `closeIcon` (close, no direction) or ✕. */
export function verdictIcon(verdict: Verdict, direction: Direction, closeIcon: LucideIcon = CircleDot): LucideIcon {
	if (verdict === "match") return Check;
	if (direction) return verdict === "close" ? (direction === "higher" ? ArrowUp : ArrowDown) : direction === "higher" ? ChevronsUp : ChevronsDown;
	return verdict === "close" ? closeIcon : X;
}

const TileVerdict = createContext<Verdict>("miss");

/** Text in a tile (in the tile's ink), sized for a seventh of a phone's width; `strong` for numbers. */
export function TileText({ children, strong, className }: { children: ReactNode; strong?: boolean; className?: string }) {
	const verdict = useContext(TileVerdict);
	return (
		<Text
			numberOfLines={1}
			adjustsFontSizeToFit
			minimumFontScale={0.7}
			className={cn("max-w-full text-center", strong ? "text-[14px] leading-[18px] font-bold" : "text-[11px] leading-[14px] font-semibold", VERDICT_STYLE[verdict].text, className)}
		>
			{children}
		</Text>
	);
}

export type ClueTileData = {
	key: string;
	verdict: Verdict;
	direction?: Direction;
	/** Defaults to verdictIcon(verdict, direction); null for none. */
	icon?: LucideIcon | null;
	/** Rotates the icon (degrees), e.g. a compass arrow. */
	iconRotation?: number;
	/** What the tile means, shown under the row when it's tapped (the website's hover hint). */
	hint: string;
	/** The screen reader's text: about the guess only, never the answer. */
	srText: string;
	/** The guess's value: TileText (and a Flag) so it takes the tile's ink. */
	content: ReactNode;
};

/** One coloured clue cell that pops in after `delay` ms. */
export function ClueTile({ tile, delay = 0, active, onPress, className }: { tile: ClueTileData; delay?: number; active?: boolean; onPress?: () => void; className?: string }) {
	const style = VERDICT_STYLE[tile.verdict];
	const tone = useVerdictTone(tile.verdict);
	const glyph = tile.icon === undefined ? verdictIcon(tile.verdict, tile.direction ?? null) : tile.icon;
	return (
		<Animated.View entering={ZoomIn.delay(delay).duration(350)} style={{ flex: 1, minWidth: 0 }}>
			<Pressable
				accessibilityRole="button"
				accessibilityLabel={tile.srText}
				accessibilityHint="Shows what this clue means"
				onPress={onPress}
				className={cn("h-14 min-w-0 items-center justify-center gap-0.5 rounded-md px-0.5", style.box, active && "opacity-80", className)}
			>
				<TileVerdict value={tile.verdict}>
					<View className="max-w-full items-center">{tile.content}</View>
				</TileVerdict>
				{glyph ? (
					<View style={tile.iconRotation ? { transform: [{ rotate: `${tile.iconRotation}deg` }] } : undefined}>
						<Icon icon={glyph} tone={tone} size={13} strokeWidth={2.5} />
					</View>
				) : null}
			</Pressable>
		</Animated.View>
	);
}

/**
 * A guess and its clue tiles: the name line (number, name, optional trailing), then the tiles in
 * one row. Tapping a tile shows its hint under the row; tapping it again hides it.
 */
export function ClueRow({ n, title, leading, onPressTitle, tiles }: { n: number; title: string; leading?: ReactNode; onPressTitle?: () => void; tiles: ClueTileData[] }) {
	const [open, setOpen] = useState<string | null>(null);
	const hint = tiles.find((t) => t.key === open)?.hint;
	return (
		<View className="gap-1.5 px-4 py-2">
			<Pressable
				disabled={!onPressTitle}
				onPress={onPressTitle}
				accessibilityRole={onPressTitle ? "link" : undefined}
				hitSlop={6}
				className="flex-row items-center gap-2 active:opacity-70"
			>
				<Text variant="caption" className="w-4 tabular-nums">
					{n}
				</Text>
				{leading}
				<Text variant="label" numberOfLines={1} className="flex-1">
					{title}
				</Text>
			</Pressable>
			<View className="flex-row gap-1">
				{tiles.map((t, i) => (
					<ClueTile key={t.key} tile={t} delay={i * 80} active={open === t.key} onPress={() => setOpen((o) => (o === t.key ? null : t.key))} />
				))}
			</View>
			{hint ? (
				<Text variant="caption" className="text-foreground">
					{hint}
				</Text>
			) : null}
		</View>
	);
}

/** Short column labels over a board of ClueRows. */
export function ClueHeader({ labels }: { labels: string[] }) {
	return (
		<View className="flex-row gap-1 px-4" importantForAccessibility="no-hide-descendants">
			{labels.map((l) => (
				<Text key={l} variant="caption" numberOfLines={1} className="flex-1 text-center text-[11px]">
					{l}
				</Text>
			))}
		</View>
	);
}

/** A small verdict swatch with a label, for legends. */
export function LegendItem({ verdict, icon, children }: { verdict: Verdict; icon: LucideIcon; children: ReactNode }) {
	const tone = useVerdictTone(verdict);
	return (
		<View className="flex-row items-center gap-2">
			<View className={cn("h-5 w-5 items-center justify-center rounded", VERDICT_STYLE[verdict].box)}>
				<Icon icon={icon} tone={tone} size={12} strokeWidth={2.5} />
			</View>
			<Text variant="caption" className="flex-1">
				{children}
			</Text>
		</View>
	);
}

/** The key under a board: match, close (what counts as close), miss, and optionally what the arrows mean. */
export function Legend({ close, direction, className }: { close: ReactNode; direction?: ReactNode; className?: string }) {
	return (
		<View className={cn("gap-2 px-4 pt-4", className)}>
			<LegendItem verdict="match" icon={Check}>
				Match
			</LegendItem>
			<LegendItem verdict="close" icon={ArrowUp}>
				{close}
			</LegendItem>
			<LegendItem verdict="miss" icon={X}>
				Miss
			</LegendItem>
			{direction ? (
				<View className="flex-row items-center gap-2">
					<View className="w-5 flex-row items-center justify-center">
						<Icon icon={ChevronsUp} tone="muted" size={14} />
					</View>
					<Text variant="caption" className="flex-1">
						{direction}
					</Text>
				</View>
			) : null}
		</View>
	);
}

/** A verdict as a small pill with an icon and a word (Career path's guess list). */
export function VerdictBadge({ verdict, icon, label }: { verdict: Verdict; icon: LucideIcon; label: string }) {
	const tone = useVerdictTone(verdict);
	return (
		<View className={cn("h-7 flex-row items-center gap-1 rounded-md px-2", VERDICT_STYLE[verdict].box)}>
			<Icon icon={icon} tone={tone} size={13} strokeWidth={2.5} />
			<Text variant="caption" className={cn("font-semibold", VERDICT_STYLE[verdict].text)}>
				{label}
			</Text>
		</View>
	);
}
