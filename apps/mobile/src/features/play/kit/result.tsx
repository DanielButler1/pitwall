// The end of a game: the result block (status, the answer, share, play again, stats, countdown),
// the countdown to the next puzzle, sharing, and a row of figures for reveals.

import { BarChart3, Dices, Share2, Timer } from "lucide-react-native";
import { useEffect, useRef, useState, type ComponentRef, type ReactNode } from "react";
import { Share, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { dayIndex, msToNextPuzzle, type GameMode } from "@pitwall/core/game/daily";
import { Button, Icon, Text } from "@/components/ui";
import { cn } from "@/lib/cn";
import { num } from "@/lib/format";
import { useGameScroll } from "./screen";

/** Opens the system share sheet with a result's text (emoji grid and link). */
export async function shareResult(text: string) {
	try {
		await Share.share({ message: text });
	} catch {
		// dismissed or unavailable: nothing to do
	}
}

const pad = (n: number) => String(n).padStart(2, "0");

/** "04:12:09" until the next puzzle (UTC midnight). */
export const formatCountdown = (ms: number) => {
	const s = Math.floor(ms / 1000);
	return `${pad(Math.floor(s / 3600))}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}`;
};

/** Time to the next puzzle, ticking every second; calls onRollover once the day changes. */
export function Countdown({ onRollover, label = "Next puzzle in", className }: { onRollover?: () => void; label?: string; className?: string }) {
	const [ms, setMs] = useState(() => msToNextPuzzle());
	const day = useRef(dayIndex());
	useEffect(() => {
		const t = setInterval(() => {
			setMs(msToNextPuzzle());
			if (dayIndex() !== day.current) {
				day.current = dayIndex();
				onRollover?.();
			}
		}, 1000);
		return () => clearInterval(t);
	}, [onRollover]);
	const time = formatCountdown(ms);
	return (
		<View className={cn("flex-row items-center justify-center gap-1.5 py-1", className)} accessible accessibilityLabel={`${label} ${time}`}>
			<Icon icon={Timer} tone="muted" size={14} />
			<Text variant="caption">{label}</Text>
			<Text variant="caption" className="font-semibold text-foreground tabular-nums">
				{time}
			</Text>
		</View>
	);
}

/**
 * The end-of-game block: a status line (green when won), the game's reveal (children), then
 * Share result, play again (practice), and in daily mode Your stats and the countdown.
 */
export function ResultCard({
	won,
	status,
	mode,
	nextLabel,
	countdownLabel,
	onNext,
	onShare,
	onStats,
	onRollover,
	children,
}: {
	won: boolean;
	status: string;
	mode: GameMode;
	/** The practice button, e.g. "Practice with a random driver". */
	nextLabel: string;
	countdownLabel?: string;
	onNext: () => void;
	onShare: () => void;
	onStats: () => void;
	onRollover?: () => void;
	children: ReactNode;
}) {
	const box = useRef<ComponentRef<typeof View>>(null);
	const { bringToTop } = useGameScroll();
	// the game just ended with the page scrolled past the top of the result: bring it into view
	useEffect(() => {
		const t = setTimeout(() => bringToTop(box.current, true), 350);
		return () => clearTimeout(t);
	}, [bringToTop]);
	return (
		<Animated.View entering={FadeInDown.duration(400)}>
			<View ref={box} className="gap-3 border-b border-border px-4 pb-5 pt-4">
				<Text variant="label" className={won ? "text-success" : "text-muted-foreground"} accessibilityRole="header">
					{status}
				</Text>
				<View className="gap-3">{children}</View>
				<View className="mt-2 gap-2">
					<Button label="Share result" icon={Share2} onPress={onShare} />
					<Button label={nextLabel} icon={Dices} variant="outline" onPress={onNext} />
					{mode === "daily" ? (
						<>
							<Button label="Your stats" icon={BarChart3} variant="ghost" onPress={onStats} />
							<Countdown onRollover={onRollover} label={countdownLabel} />
						</>
					) : null}
				</View>
			</View>
		</Animated.View>
	);
}

/** A row of labelled figures (label above a number), as in a reveal's career stats. */
export function Figures({ items }: { items: [string, number | string][] }) {
	return (
		<View className="flex-row flex-wrap gap-x-6 gap-y-2">
			{items.map(([label, v]) => (
				<View key={label}>
					<Text variant="caption">{label}</Text>
					<Text variant="heading" className="tabular-nums">
						{typeof v === "number" ? num(v) : v}
					</Text>
				</View>
			))}
		</View>
	);
}
