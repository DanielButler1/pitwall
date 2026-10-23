// A game's screen chrome: the pushed screen with the puzzle number and a stats button, the
// Daily / Practice switch with any extra controls (difficulty), a "How to play" note, and the
// loading and error states.

import { BarChart3, ChevronDown, ChevronUp, RotateCcw } from "lucide-react-native";
import { createContext, useContext, useImperativeHandle, useMemo, useRef, useState, type ComponentRef, type ReactNode, type Ref } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { puzzleNumber, type GameMode } from "@pitwall/core/game/daily";
import { DetailScreen } from "@/components/f1";
import { Button, Icon, IconButton, ReadableWidth, Segmented, Skeleton, Text } from "@/components/ui";
import { haptic } from "@/lib/haptics";

export type Choice<T extends string> = { id: T; label: string; description?: string };

/** A segmented switch (Daily / Practice, Modern / All time) with the selection haptic. */
export function ChoiceToggle<T extends string>({ value, options, onChange, className }: { value: T; options: Choice<T>[]; onChange: (value: T) => void; className?: string }) {
	return (
		<Segmented
			className={className}
			value={value}
			options={options.map((o) => ({ value: o.id, label: o.label }))}
			onChange={(v) => {
				if (v === value) return;
				haptic("selection");
				onChange(v);
			}}
		/>
	);
}

/**
 * The pushed screen for a game: back, the title, "Puzzle #N" (or the practice label) under it,
 * and a stats button. The body scrolls; pass `scrollRef` to scroll it from the game.
 */
export function GameScreen({
	title,
	today,
	mode,
	practiceLabel = "Practice",
	onStats,
	scrollRef,
	children,
}: {
	title: string;
	today: number | null;
	mode: GameMode;
	practiceLabel?: string;
	onStats?: () => void;
	scrollRef?: Ref<ComponentRef<typeof ScrollView>>;
	children: ReactNode;
}) {
	const subtitle = mode === "practice" ? practiceLabel : today != null ? `Puzzle #${puzzleNumber(today)}` : null;
	const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
	const offset = useRef(0);
	useImperativeHandle(scrollRef, () => scroll.current!, []);
	const value = useMemo<GameScrollValue>(
		() => ({
			bringToTop: (view, onlyIfAbove) => {
				const sv = scroll.current;
				if (!sv || !view) return;
				sv.measureInWindow((_sx, sy) => view.measureInWindow((_vx, vy) => {
					if (onlyIfAbove && vy >= sy) return;
					sv.scrollTo({ y: Math.max(0, offset.current + vy - sy - 8), animated: true });
				}));
			},
		}),
		[],
	);
	return (
		<DetailScreen title={title} subtitle={subtitle} right={onStats ? <IconButton icon={BarChart3} label="Your stats" onPress={onStats} /> : null}>
			<ScrollView
				ref={scroll}
				onScroll={(e) => {
					offset.current = e.nativeEvent.contentOffset.y;
				}}
				scrollEventThrottle={32}
				contentContainerClassName="pb-16"
				keyboardShouldPersistTaps="handled"
				keyboardDismissMode="on-drag"
			>
				<GameScroll value={value}>
					<ReadableWidth>{children}</ReadableWidth>
				</GameScroll>
			</ScrollView>
		</DetailScreen>
	);
}

type GameScrollValue = { bringToTop: (view: ComponentRef<typeof View> | null, onlyIfAbove?: boolean) => void };
const GameScroll = createContext<GameScrollValue>({ bringToTop: () => undefined });

/** Inside a GameScreen: `bringToTop(view)` scrolls the body so `view` sits at the top (the picker does it on focus, so its list has room above the keyboard). */
export const useGameScroll = () => useContext(GameScroll);

const MODES: Choice<GameMode>[] = [
	{ id: "daily", label: "Daily" },
	{ id: "practice", label: "Practice" },
];

/**
 * The top of a game's page: Daily / Practice (omit `onModeChange` for daily-only games), extra
 * `controls` (e.g. a difficulty ChoiceToggle), and the rules under "How to play".
 */
export function GameHeader({
	mode,
	onModeChange,
	practiceLabel = "Practice",
	controls,
	children,
}: {
	mode: GameMode;
	onModeChange?: (mode: GameMode) => void;
	practiceLabel?: string;
	controls?: ReactNode;
	/** The rules: plain text or Text nodes. */
	children?: ReactNode;
}) {
	return (
		<View className="gap-2 px-4 pt-2">
			{onModeChange ? <ChoiceToggle value={mode} options={MODES.map((m) => (m.id === "practice" ? { ...m, label: practiceLabel } : m))} onChange={onModeChange} /> : null}
			{controls}
			{children ? <HowToPlay>{children}</HowToPlay> : null}
		</View>
	);
}

/** A folded note: "How to play", opening to the rules. */
export function HowToPlay({ children, title = "How to play" }: { children: ReactNode; title?: string }) {
	const [open, setOpen] = useState(false);
	return (
		<View>
			<Pressable
				accessibilityRole="button"
				accessibilityState={{ expanded: open }}
				onPress={() => setOpen((o) => !o)}
				className="min-h-11 flex-row items-center justify-between active:opacity-70"
			>
				<Text variant="label">{title}</Text>
				<Icon icon={open ? ChevronUp : ChevronDown} tone="muted" size={18} />
			</Pressable>
			{open ? typeof children === "string" ? <Text variant="muted">{children}</Text> : children : null}
		</View>
	);
}

/** Placeholder while the game's data builds or loads. */
export function GameLoading() {
	return (
		<View className="gap-3 px-4 py-4">
			<Skeleton className="h-11 w-full" />
			<Skeleton className="h-24 w-full" />
			<Skeleton className="h-14 w-full" />
		</View>
	);
}

/** Load failure with a Retry button; `what` completes "Couldn't load …". */
export function GameError({ what, onRetry }: { what: string; onRetry: () => void }) {
	return (
		<View className="mx-4 mt-4 flex-row items-center justify-between gap-4 rounded-md border border-border px-3 py-3">
			<Text variant="muted" className="flex-1">
				Couldn&apos;t load {what}.
			</Text>
			<Button label="Retry" icon={RotateCcw} variant="outline" size="sm" onPress={onRetry} />
		</View>
	);
}
