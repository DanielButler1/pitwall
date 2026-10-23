// The app's own sheet, drawn and animated in its design: `full` covers the screen (pickers, long
// lists), `panel` rises from the bottom over a dimmed screen (stats). The Modal underneath is only
// a window to draw in (no system animation or chrome); Android's back button and a tap on the
// dimmed area close it.

import { X } from "lucide-react-native";
import type { ReactNode } from "react";
import { Modal, Pressable, View } from "react-native";
import Animated, { FadeIn, ReduceMotion, SlideInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { cn } from "@/lib/cn";
import { IconButton } from "./button";
import { Text } from "./text";

const motion = ReduceMotion.System;

export function Sheet({
	open,
	onClose,
	title,
	subtitle,
	right,
	variant = "full",
	children,
}: {
	open: boolean;
	onClose: () => void;
	title: ReactNode;
	subtitle?: ReactNode;
	/** Extra header buttons, before the close button. */
	right?: ReactNode;
	variant?: "full" | "panel";
	children: ReactNode;
}) {
	const insets = useSafeAreaInsets();
	const header = (
		<View className="flex-row items-start gap-2 py-2 pl-4 pr-2">
			<View className="flex-1 pt-2">
				{typeof title === "string" ? (
					<Text variant={variant === "panel" ? "title" : "heading"} accessibilityRole="header" numberOfLines={2}>
						{title}
					</Text>
				) : (
					title
				)}
				{typeof subtitle === "string" ? (
					<Text variant="muted" className="mt-0.5">
						{subtitle}
					</Text>
				) : (
					subtitle
				)}
			</View>
			{right}
			<IconButton icon={X} label="Close" onPress={onClose} />
		</View>
	);
	return (
		<Modal visible={open} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
			{variant === "full" ? (
				<Animated.View entering={SlideInDown.duration(240).reduceMotion(motion)} className="flex-1 bg-background" style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}>
					{header}
					{children}
				</Animated.View>
			) : (
				<View className="flex-1 justify-end">
					<Animated.View entering={FadeIn.duration(200).reduceMotion(motion)} className="absolute inset-0">
						<Pressable accessibilityLabel="Close" className="flex-1 bg-black/50" onPress={onClose} />
					</Animated.View>
					<Animated.View
						entering={SlideInDown.duration(240).reduceMotion(motion)}
						accessibilityViewIsModal
						className={cn("max-h-[85%] rounded-t-2xl border-t border-border bg-background")}
						style={{ paddingBottom: insets.bottom + 12 }}
					>
						<View className="items-center pt-2">
							<View className="h-1 w-10 rounded-full bg-border" />
						</View>
						{header}
						{children}
					</Animated.View>
				</View>
			)}
		</Modal>
	);
}
