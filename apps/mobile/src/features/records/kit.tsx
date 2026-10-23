// Small pieces shared by the Records tab's screens.

import { useRef, type ComponentRef, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react-native";
import { Pressable, ScrollView, View } from "react-native";
import { Chip, Icon, Segmented, Text } from "@/components/ui";
import { cn } from "@/lib/cn";
import { haptic } from "@/lib/haptics";

/** One choice among a few, full width: the kit's Segmented with the selection haptic. */
export function Choice<T extends string>({ value, options, onChange, className }: { value: T; options: { value: NoInfer<T>; label: string }[]; onChange(v: NoInfer<T>): void; className?: string }) {
	return (
		<Segmented
			value={value}
			options={options}
			className={cn("mx-4", className)}
			onChange={(v) => {
				if (v === value) return;
				haptic("selection");
				onChange(v);
			}}
		/>
	);
}

/**
 * One choice among many, as a scrolling row of chips. The chosen chip is scrolled into view, so a
 * category opened from a link shows which variant it is.
 */
export function ChoiceChips<T extends string>({ value, options, onChange, className }: { value: T; options: { value: NoInfer<T>; label: string }[]; onChange(v: NoInfer<T>): void; className?: string }) {
	const scroller = useRef<ComponentRef<typeof ScrollView>>(null);
	const shown = useRef(false);
	return (
		<ScrollView ref={scroller} horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" className={cn("grow-0", className)} contentContainerClassName="gap-2 px-4">
			{options.map((o) => (
				<View
					key={o.value}
					onLayout={(e) => {
						// only on first layout: later taps leave the row where the finger put it
						if (o.value !== value || shown.current) return;
						shown.current = true;
						if (e.nativeEvent.layout.x > 200) scroller.current?.scrollTo({ x: e.nativeEvent.layout.x - 16, animated: false });
					}}
				>
					<Chip
						label={o.label}
						selected={o.value === value}
						onPress={() => {
							if (o.value === value) return;
							haptic("selection");
							onChange(o.value);
						}}
					/>
				</View>
			))}
		</ScrollView>
	);
}

/** A muted note under a list or a section (coverage, method). */
export function Note({ children, className }: { children: ReactNode; className?: string }) {
	return (
		<Text variant="caption" className={cn("px-4 pt-2 leading-[18px]", className)}>
			{children}
		</Text>
	);
}

/** An inline highlighted note box (data coverage, "nothing changes"). */
export function Callout({ title, children, className }: { title?: string; children: ReactNode; className?: string }) {
	return (
		<View className={cn("mx-4 rounded-md border border-border bg-muted/40 px-3 py-2.5", className)}>
			{title ? <Text variant="label">{title}</Text> : null}
			<Text variant="muted" className={title ? "mt-0.5" : undefined}>{children}</Text>
		</View>
	);
}

/** Today's date on this phone. */
export function today() {
	const d = new Date();
	return { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate(), iso: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}` };
}

/** Previous / next buttons with the chevrons on their own sides (the kit's Button puts icons first). */
export function Stepper({ prev, next, onPrev, onNext, className }: { prev: string; next: string; onPrev(): void; onNext(): void; className?: string }) {
	const box = "h-10 flex-1 flex-row items-center gap-1.5 rounded-md border border-border px-3 active:bg-accent";
	return (
		<View className={cn("flex-row gap-2 px-4", className)}>
			<Pressable accessibilityRole="button" accessibilityLabel={`Previous: ${prev}`} onPress={onPrev} className={cn(box, "justify-start")}>
				<Icon icon={ChevronLeft} tone="muted" size={16} />
				<Text variant="label" numberOfLines={1} className="shrink">{prev}</Text>
			</Pressable>
			<Pressable accessibilityRole="button" accessibilityLabel={`Next: ${next}`} onPress={onNext} className={cn(box, "justify-end")}>
				<Text variant="label" numberOfLines={1} className="shrink">{next}</Text>
				<Icon icon={ChevronRight} tone="muted" size={16} />
			</Pressable>
		</View>
	);
}
