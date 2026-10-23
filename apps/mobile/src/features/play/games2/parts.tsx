// Small pieces the six games here share that the play kit doesn't have: a full-screen sheet
// (the ui kit's) and names that only link once a game is over.

import type { ReactNode } from "react";
import { Pressable } from "react-native";
import { Sheet as KitSheet, Text } from "@/components/ui";
import { cn } from "@/lib/cn";

/**
 * A full-screen sheet over the game (pickers, "See all" lists): title row with a close button,
 * then the content. Android's back button closes it.
 */
export function Sheet({ open, onClose, title, subtitle, children }: { open: boolean; onClose: () => void; title: ReactNode; subtitle?: ReactNode; children: ReactNode }) {
	return (
		<KitSheet open={open} onClose={onClose} title={title} subtitle={subtitle}>
			{children}
		</KitSheet>
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
