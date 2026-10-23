// The app's own loading spinner, in place of the system's ActivityIndicator: a quarter arc turning
// on a faint ring, in a token colour. With reduced motion it stays still.

import { useEffect } from "react";
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import Svg, { Circle } from "react-native-svg";
import { useToneColor, type IconTone } from "./icon";

const SIZES = { small: 18, large: 28 } as const;

export function Spinner({ tone = "muted", size = "large", color, accessibilityLabel = "Loading" }: { tone?: IconTone; size?: keyof typeof SIZES; color?: string; accessibilityLabel?: string }) {
	const toned = useToneColor(tone);
	const ink = color ?? toned;
	const px = SIZES[size];
	const stroke = size === "small" ? 2 : 2.5;
	const r = (px - stroke) / 2;
	const turn = useSharedValue(0);
	const still = useReducedMotion();

	useEffect(() => {
		if (still) return;
		turn.value = withRepeat(withTiming(1, { duration: 800, easing: Easing.linear }), -1, false);
		return () => cancelAnimation(turn);
	}, [still, turn]);

	const spin = useAnimatedStyle(() => ({ transform: [{ rotate: `${turn.value * 360}deg` }] }));

	return (
		<Animated.View accessibilityRole="progressbar" accessibilityLabel={accessibilityLabel} style={[{ width: px, height: px }, spin]}>
			<Svg width={px} height={px}>
				<Circle cx={px / 2} cy={px / 2} r={r} stroke={ink} strokeOpacity={0.2} strokeWidth={stroke} fill="none" />
				<Circle
					cx={px / 2}
					cy={px / 2}
					r={r}
					stroke={ink}
					strokeWidth={stroke}
					fill="none"
					strokeLinecap="round"
					strokeDasharray={`${(Math.PI * 2 * r) / 4} ${Math.PI * 2 * r}`}
				/>
			</Svg>
		</Animated.View>
	);
}
