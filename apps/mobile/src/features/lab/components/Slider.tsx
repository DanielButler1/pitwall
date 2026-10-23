// A slider for the Lab's dials (unpredictability, reliability, skill and pace changes): drag or tap
// along the track; a tick at each step. Built on the responder system, so it needs nothing native;
// the accessibility actions step it for screen readers.

import { useRef, useState } from "react";
import { View, type GestureResponderEvent, type LayoutChangeEvent } from "react-native";
import { Text } from "@/components/ui";
import { haptic } from "@/lib/haptics";

export function Slider({
	label,
	value,
	min,
	max,
	step,
	onChange,
	format = (v) => String(v),
	hint,
	last,
}: {
	label: string;
	value: number;
	min: number;
	max: number;
	step: number;
	onChange: (v: number) => void;
	format?: (v: number) => string;
	hint?: string;
	last?: boolean;
}) {
	const [width, setWidth] = useState(0);
	// the last value sent while dragging (props lag a frame behind)
	const latest = useRef(value);
	const snap = (v: number) => {
		const n = Math.round((Math.min(max, Math.max(min, v)) - min) / step) * step + min;
		return Number(n.toFixed(4));
	};
	const fromX = (x: number) => snap(min + (width ? x / width : 0) * (max - min));
	const set = (v: number) => {
		if (v === latest.current) return;
		latest.current = v;
		haptic("tick");
		onChange(v);
	};
	const move = (e: GestureResponderEvent) => set(fromX(e.nativeEvent.locationX));
	const grant = (e: GestureResponderEvent) => {
		latest.current = value;
		move(e);
	};
	const fraction = (value - min) / (max - min || 1);
	return (
		<View className="pl-4">
			<View className={last ? "py-3 pr-4" : "border-b border-border py-3 pr-4"}>
				<View className="flex-row items-baseline justify-between gap-3">
					<Text variant="caption" className="flex-1">{label}</Text>
					<Text variant="label" className="tabular-nums">
						{format(value)}
					</Text>
				</View>
				<View
					accessible
					accessibilityRole="adjustable"
					accessibilityLabel={label}
					accessibilityValue={{ text: format(value) }}
					accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
					onAccessibilityAction={(e) => onChange(snap(value + (e.nativeEvent.actionName === "increment" ? step : -step)))}
					onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
					onStartShouldSetResponder={() => true}
					onMoveShouldSetResponder={() => true}
					onResponderTerminationRequest={() => false}
					onResponderGrant={grant}
					onResponderMove={move}
					hitSlop={{ top: 10, bottom: 10 }}
					className="mt-2 h-8 justify-center"
				>
					<View pointerEvents="none" className="h-1.5 rounded-full bg-muted">
						<View className="h-1.5 rounded-full bg-universe" style={{ width: `${fraction * 100}%` }} />
					</View>
					<View pointerEvents="none" className="absolute h-6 w-6 rounded-full border-2 border-universe bg-background" style={{ left: Math.min(Math.max(0, width - 24), Math.max(0, fraction * width - 12)) }} />
				</View>
				{hint ? <Text variant="caption">{hint}</Text> : null}
			</View>
		</View>
	);
}
