// Small pieces the six games here share that the play kit doesn't have: a full-screen sheet
// (RN Modal) and names that only link once a game is over.

import { X } from "lucide-react-native";
import type { ReactNode } from "react";
import { Modal, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { IconButton, Text } from "@/components/ui";
import { cn } from "@/lib/cn";

/**
 * A full-screen sheet over the game (pickers, "See all" lists): title row with a close button,
 * then the content. Android's back button closes it.
 */
export function Sheet({ open, onClose, title, subtitle, children }: { open: boolean; onClose: () => void; title: ReactNode; subtitle?: ReactNode; children: ReactNode }) {
	const insets = useSafeAreaInsets();
	return (
		<Modal visible={open} animationType="slide" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
			<View className="flex-1 bg-background" style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}>
				<View className="flex-row items-start gap-2 py-2 pl-4 pr-2">
					<View className="flex-1 pt-2">
						{typeof title === "string" ? <Text variant="heading">{title}</Text> : title}
						{typeof subtitle === "string" ? (
							<Text variant="caption" className="mt-1">
								{subtitle}
							</Text>
						) : (
							subtitle
						)}
					</View>
					<IconButton icon={X} label="Close" onPress={onClose} />
				</View>
				{children}
			</View>
		</Modal>
	);
}

/** A name that opens its page when `onPress` is given (once the game is over), plain text before then. */
export function NameLink({ onPress, children, className, numberOfLines = 1 }: { onPress?: () => void; children: ReactNode; className?: string; numberOfLines?: number }) {
	if (!onPress)
		return (
			<Text variant="label" className={className} numberOfLines={numberOfLines}>
				{children}
			</Text>
		);
	return (
		<Pressable accessibilityRole="link" onPress={onPress} hitSlop={6} className="shrink active:opacity-70">
			<Text variant="label" className={cn("text-link", className)} numberOfLines={numberOfLines}>
				{children}
			</Text>
		</Pressable>
	);
}
