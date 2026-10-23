// The app's own dialogs and toasts, drawn in its design rather than the system's: `confirm()` asks,
// `alert()` tells, `toast()` reports an outcome in passing. One `FeedbackHost` (app/_layout.tsx)
// draws them above every screen. Call them from anywhere, no hooks needed.
//
// Never use React Native's Alert or Android toasts: they look like the system, not like Pitwall.

import { useEffect } from "react";
import { AccessibilityInfo, BackHandler, Pressable, View } from "react-native";
import Animated, { FadeIn, FadeInDown, FadeOut, FadeOutDown, ReduceMotion } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { cn } from "@/lib/cn";
import { createStore } from "@/lib/store";
import { Button } from "./button";
import { Text } from "./text";

/* ---------------------------------------------------------------- dialogs --- */

export type DialogAction = { label: string; style?: "default" | "cancel" | "destructive"; onPress?: () => void };
type Dialog = { id: number; title: string; body?: string; actions: DialogAction[] };

const dialogs = createStore<Dialog[]>([]);
let nextId = 1;

/** A message with buttons (just "OK" when none are given). Back and a tap outside choose the cancel button, or close. */
export function alert(title: string, body?: string, actions: DialogAction[] = [{ label: "OK", style: "cancel" }]) {
	dialogs.set((all) => [...all, { id: nextId++, title, body, actions }]);
}

/** Asks before doing something; resolves true when confirmed. */
export function confirm({ title, body, confirmLabel, cancelLabel = "Cancel", destructive = false }: { title: string; body?: string; confirmLabel: string; cancelLabel?: string; destructive?: boolean }): Promise<boolean> {
	return new Promise((resolve) =>
		alert(title, body, [
			{ label: cancelLabel, style: "cancel", onPress: () => resolve(false) },
			{ label: confirmLabel, style: destructive ? "destructive" : "default", onPress: () => resolve(true) },
		]),
	);
}

function close(dialog: Dialog, action?: DialogAction) {
	dialogs.set((all) => all.filter((d) => d.id !== dialog.id));
	(action ?? dialog.actions.find((a) => a.style === "cancel"))?.onPress?.();
}

/* ----------------------------------------------------------------- toasts --- */

type Toast = { id: number; message: string; tone: "default" | "error" };
const toasts = createStore<Toast | null>(null);
let toastTimer: ReturnType<typeof setTimeout> | undefined;

/** A short note near the bottom of the screen ("Universe deleted"), gone after a few seconds. */
export function toast(message: string, { tone = "default" }: { tone?: Toast["tone"] } = {}) {
	clearTimeout(toastTimer);
	toasts.set({ id: nextId++, message, tone });
	AccessibilityInfo.announceForAccessibility(message);
	toastTimer = setTimeout(() => toasts.set(null), Math.min(6000, 2500 + message.length * 40));
}

/* ------------------------------------------------------------------- host --- */

const motion = ReduceMotion.System;

/** Draws the open dialog and the current toast above everything; mount once at the root. */
export function FeedbackHost() {
	const dialog = dialogs.use((all) => all[0] ?? null);
	const current = toasts.use();
	const insets = useSafeAreaInsets();

	// Android's back button closes the dialog as its cancel button would
	useEffect(() => {
		if (!dialog) return;
		const sub = BackHandler.addEventListener("hardwareBackPress", () => {
			close(dialog);
			return true;
		});
		return () => sub.remove();
	}, [dialog]);

	return (
		<>
			{current ? (
				<Animated.View
					key={current.id}
					entering={FadeInDown.duration(180).reduceMotion(motion)}
					exiting={FadeOutDown.duration(160).reduceMotion(motion)}
					pointerEvents="box-none"
					className="absolute inset-x-0 items-center px-4"
					style={{ bottom: insets.bottom + 76 }}
				>
					<Pressable
						accessibilityRole="alert"
						onPress={() => toasts.set(null)}
						className={cn("max-w-[560px] flex-row items-center rounded-md border px-4 py-3", current.tone === "error" ? "border-destructive/40 bg-popover" : "border-border bg-popover")}
					>
						<Text variant="label" className={cn("flex-1", current.tone === "error" && "text-destructive")}>
							{current.message}
						</Text>
					</Pressable>
				</Animated.View>
			) : null}
			{dialog ? (
				<Animated.View key={dialog.id} entering={FadeIn.duration(150).reduceMotion(motion)} exiting={FadeOut.duration(120).reduceMotion(motion)} className="absolute inset-0 items-center justify-center px-6">
					<Pressable accessibilityLabel="Close" onPress={() => close(dialog)} className="absolute inset-0 bg-black/50" />
					<View accessibilityViewIsModal accessibilityRole="alert" className="w-full max-w-[420px] rounded-md border border-border bg-popover p-5">
						<Text variant="heading">{dialog.title}</Text>
						{dialog.body ? (
							<Text variant="muted" className="mt-2">
								{dialog.body}
							</Text>
						) : null}
						<View className="mt-5 gap-2">
							{/* the main action first, cancel last: thumbs reach the top button first */}
							{[...dialog.actions]
								.sort((a, b) => Number(a.style === "cancel") - Number(b.style === "cancel"))
								.map((action) => (
									<Button
										key={action.label}
										label={action.label}
										variant={action.style === "destructive" ? "destructive" : action.style === "cancel" ? "ghost" : dialog.actions.length === 1 ? "secondary" : "primary"}
										onPress={() => close(dialog, action)}
									/>
								))}
						</View>
					</View>
				</Animated.View>
			) : null}
		</>
	);
}
