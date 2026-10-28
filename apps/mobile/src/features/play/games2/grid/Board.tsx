// The 3×3 board: column headers across the top, row headers down the side, nine square cells
// sized to the phone's width. An open cell opens the picker; a wrong guess flashes it red.

import {
	Anchor,
	Ban,
	CalendarDays,
	Car,
	Crown,
	Flag as FlagIcon,
	Hash,
	House,
	Medal,
	Plus,
	Repeat,
	Timer,
	Trophy,
	Users,
	X,
	Zap,
	type LucideIcon,
} from "lucide-react-native";
import { useEffect } from "react";
import { Pressable, View } from "react-native";
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSequence, withTiming, ZoomIn } from "react-native-reanimated";
import { categoryHint, type Board, type Category, type Grid, type GridData } from "@pitwall/core/game/grid";
import { Flag } from "@/components/f1";
import { Icon, Text } from "@/components/ui";
import { cn } from "@/lib/cn";
import { VERDICT_STYLE } from "@/features/play/kit";

const FEAT_ICON: Record<string, LucideIcon> = {
	winner: Trophy,
	pole: Timer,
	"fastest-lap": Zap,
	podium: Medal,
	champion: Crown,
	"starts-100": Hash,
	"starts-200": Hash,
	pointless: Ban,
	monaco: Anchor,
	"home-win": House,
	"teams-5": Repeat,
};

export function CategoryIcon({ cat, size = 24 }: { cat: Category; size?: number }) {
	if (cat.kind === "nation") return <Flag code={cat.flag} className={size > 24 ? "text-[20px]" : "text-[17px]"} />;
	const glyph = cat.kind === "team" ? Car : cat.kind === "decade" ? CalendarDays : cat.kind === "mate" ? Users : (FEAT_ICON[cat.key] ?? FlagIcon);
	const box = cat.kind === "team" ? "bg-primary/12" : cat.kind === "decade" ? "bg-chart-2/20" : "bg-warning/20";
	return (
		<View className={cn("items-center justify-center rounded-full", box)} style={{ width: size, height: size }}>
			<Icon icon={glyph} tone={cat.kind === "team" ? "primary" : cat.kind === "decade" ? "link" : "warning"} size={Math.round(size * 0.58)} strokeWidth={2} />
		</View>
	);
}

const kindLabel: Record<Category["kind"], string> = { team: "Team", nation: "Nationality", decade: "Decade", feat: "Feat", mate: "Team-mate" };

function Header({ cat, axis, onPress }: { cat: Category; axis: "row" | "col"; onPress: () => void }) {
	return (
		<Pressable
			accessibilityRole="button"
			accessibilityLabel={`${cat.label} (${kindLabel[cat.kind]}: ${categoryHint(cat)})`}
			accessibilityHint="Shows what this category means"
			onPress={onPress}
			className={cn("min-w-0 flex-1 items-center justify-center gap-1 active:opacity-70", axis === "col" ? "pb-1.5" : "pr-1")}
		>
			<CategoryIcon cat={cat} />
			<Text numberOfLines={3} className="text-center text-[11px] leading-[13px] font-semibold text-foreground">
				{cat.label}
			</Text>
		</Pressable>
	);
}

/** Row header column width; the cells share what's left. */
const SIDE = 72;
const GAP = 6;

export function BoardView({
	data,
	grid,
	board,
	answerCounts,
	over,
	flash,
	onPick,
	onHint,
}: {
	data: GridData;
	grid: Grid;
	board: Board;
	answerCounts: number[];
	over: boolean;
	flash: { cell: number; n: number } | null;
	onPick: (cell: number) => void;
	/** A header was tapped: show what its category means. */
	onHint: (cat: Category) => void;
}) {
	const cat = (i: number) => data.categories[i];
	return (
		<View className="px-4" accessibilityLabel="Grid of nine">
			<View className="flex-row" style={{ gap: GAP }}>
				<View style={{ width: SIDE }} className="items-center justify-end pb-1.5">
					<Text className="text-[22px] leading-7 font-bold tabular-nums text-foreground">{board.left}</Text>
					<Text variant="caption" className="text-center text-[10px] leading-3">
						{board.left === 1 ? "guess left" : "guesses left"}
					</Text>
				</View>
				{grid.cols.map((c) => (
					<Header key={c} cat={cat(c)} axis="col" onPress={() => onHint(cat(c))} />
				))}
			</View>
			{grid.rows.map((r, ri) => (
				<View key={r} className="flex-row" style={{ gap: GAP, marginTop: GAP }}>
					<View style={{ width: SIDE }} className="flex-row">
						<Header cat={cat(r)} axis="row" onPress={() => onHint(cat(r))} />
					</View>
					{grid.cols.map((c, ci) => {
						const i = ri * 3 + ci;
						return (
							<Cell
								key={`${r}-${c}`}
								label={`${cat(r).label} × ${cat(c).label}`}
								state={board.cells[i]}
								count={answerCounts[i]}
								over={over}
								misses={board.misses.filter((m) => m.cell === i).length}
								flashKey={flash?.cell === i ? flash.n : 0}
								onPick={() => onPick(i)}
							/>
						);
					})}
				</View>
			))}
		</View>
	);
}

function Cell({
	label,
	state,
	count,
	over,
	misses,
	flashKey,
	onPick,
}: {
	label: string;
	state: Board["cells"][number];
	count: number;
	over: boolean;
	misses: number;
	flashKey: number;
	onPick: () => void;
}) {
	const reduced = useReducedMotion();
	const flash = useSharedValue(0);
	useEffect(() => {
		if (flashKey > 0) flash.value = withSequence(withTiming(1, { duration: 80 }), withTiming(0, { duration: 700 }));
	}, [flashKey, flash]);
	const flashStyle = useAnimatedStyle(() => ({ opacity: flash.value }));
	const box = "aspect-square min-w-0 flex-1 items-center justify-center overflow-hidden rounded-md p-1";

	if (state) {
		const d = state.driver;
		return (
			<Animated.View
				entering={reduced ? undefined : ZoomIn.duration(400)}
				accessible
				accessibilityLabel={`${label}: ${d.name}, rarity ${state.rarity} of 100`}
				className={cn(box, "gap-0.5", VERDICT_STYLE.match.box)}
			>
				<Flag code={d.flag} className="text-[14px]" />
				<Text numberOfLines={2} className={cn("text-center text-[12px] leading-[14px] font-bold", VERDICT_STYLE.match.text)}>
					{d.lastName}
				</Text>
				<View className="mt-0.5 rounded-full bg-black/20 px-1.5">
					<Text className="text-[11px] font-semibold tabular-nums text-white">{state.rarity}</Text>
				</View>
			</Animated.View>
		);
	}
	if (over) {
		return (
			<View accessible accessibilityLabel={`${label}: not filled. ${count} answers`} className={cn(box, "gap-1", VERDICT_STYLE.miss.box)}>
				<Icon icon={X} tone="muted" size={18} />
				<Text variant="caption" className="text-center text-[11px]">
					{count} answers
				</Text>
			</View>
		);
	}
	return (
		<Pressable
			accessibilityRole="button"
			accessibilityLabel={`${label}: pick a driver${misses ? ` (${misses} wrong so far)` : ""}`}
			onPress={onPick}
			className={cn(box, "border border-border bg-card active:bg-accent")}
		>
			<Animated.View pointerEvents="none" className="absolute inset-0 bg-destructive/35" style={flashStyle} />
			<Icon icon={Plus} tone="muted" size={24} />
			{misses > 0 ? (
				<Text variant="caption" className="absolute right-1.5 bottom-1 text-[10px]">
					{"✕".repeat(Math.min(misses, 3))}
				</Text>
			) : null}
		</Pressable>
	);
}
