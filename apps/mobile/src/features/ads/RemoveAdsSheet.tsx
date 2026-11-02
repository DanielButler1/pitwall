// The offer: the app's own panel sheet, opened from the link under an ad and from Settings. Only the payment screen
// itself is the store's.

import { Check } from "lucide-react-native";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { Button, Icon, Sheet, Text, toast } from "@/components/ui";
import { haptic } from "@/lib/haptics";
import { createStore } from "@/lib/store";
import { buyAdFree, purchaseStore, restoreAdFree } from "./purchases";

const openStore = createStore(false);

/** Shows the "Remove ads" sheet. */
export const openRemoveAds = () => openStore.set(true);

const POINTS = ["No ads anywhere in the app", "On every phone signed in to your store account", "Everything else stays free, as now"];

/** Mount once at the root, beside FeedbackHost. */
export function RemoveAdsSheet() {
	const open = openStore.use();
	const { available, price } = purchaseStore.use();
	const [busy, setBusy] = useState<"buy" | "restore" | null>(null);
	const close = () => openStore.set(false);

	const buy = async () => {
		setBusy("buy");
		const outcome = await buyAdFree();
		setBusy(null);
		if (outcome === "bought") {
			haptic("success");
			close();
			toast("Ads removed. Thanks for supporting Pitwall");
		} else if (outcome === "pending") {
			close();
			toast("Payment pending. Ads go once it's through");
		} else if (outcome === "failed") {
			haptic("error");
			toast("The purchase didn't go through. Try again later", { tone: "error" });
		}
	};

	const restore = async () => {
		setBusy("restore");
		const found = await restoreAdFree();
		setBusy(null);
		if (found) {
			haptic("success");
			close();
			toast("Purchase restored. Ads removed");
		} else {
			toast(found === false ? "No purchase found for this account" : "Couldn't reach the store. Try again later", { tone: found === false ? "default" : "error" });
		}
	};

	return (
		<Sheet open={open} onClose={close} variant="panel" title="Remove ads" subtitle="One payment, yours for good. It also keeps Pitwall running.">
			<View className="px-4 pt-1">
				{POINTS.map((point) => (
					<View key={point} className="flex-row items-center gap-2 py-1.5">
						<Icon icon={Check} tone="success" size={17} />
						<Text variant="body" className="flex-1">{point}</Text>
					</View>
				))}
				{available ? (
					<>
						<Button className="mt-4" size="lg" label={price ? `${price} · Remove ads` : "Remove ads"} loading={busy === "buy"} disabled={busy !== null} onPress={() => void buy()} />
						<Button className="mt-1" variant="ghost" label="Not now" onPress={close} />
						<View className="flex-row justify-center pt-1">
							<Text variant="caption">Already paid? </Text>
							<Pressable accessibilityRole="button" disabled={busy !== null} hitSlop={8} onPress={() => void restore()}>
								<Text variant="caption" className="font-semibold text-link">{busy === "restore" ? "Restoring…" : "Restore purchase"}</Text>
							</Pressable>
						</View>
					</>
				) : (
					<Text variant="muted" className="pt-4 text-center">Not available in this build yet.</Text>
				)}
			</View>
		</Sheet>
	);
}
