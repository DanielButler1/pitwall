// One ad, drawn as a Pitwall row: the advertiser's words and picture in the app's font, border and spacing, with an
// "Ad" badge and Google's AdChoices mark so it's plainly an ad. Nothing at all (no gap, no placeholder) until an ad
// has loaded, for ad-free phones, and when there's none to show.

import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { NativeAd, NativeAdChoicesPlacement, NativeAdView, NativeAsset, NativeAssetType, NativeMediaAspectRatio, NativeMediaView } from "react-native-google-mobile-ads";
import { Badge, Text } from "@/components/ui";
import { cn } from "@/lib/cn";
import { adsStore, NATIVE_UNIT } from "./ads";
import { purchaseStore } from "./purchases";
import { openRemoveAds } from "./RemoveAdsSheet";

// AdMob's smallest media view (dp): anything smaller can't play video ads.
const MEDIA = 120;

/** An ad between two sections of a page. One per screen at most. */
export function NativeAdSlot({ className }: { className?: string }) {
	const ready = adsStore.use((s) => s.ready);
	const adFree = purchaseStore.use((s) => s.adFree);
	const available = purchaseStore.use((s) => s.available);
	const price = purchaseStore.use((s) => s.price);
	const [ad, setAd] = useState<NativeAd | null>(null);
	const show = ready && !adFree && NATIVE_UNIT;

	useEffect(() => {
		if (!show) return;
		let live = true;
		let loaded: NativeAd | null = null;
		NativeAd.createForAdRequest(show, {
			aspectRatio: NativeMediaAspectRatio.SQUARE,
			adChoicesPlacement: NativeAdChoicesPlacement.TOP_RIGHT,
			keywords: ["formula 1", "motorsport", "racing"],
		})
			.then((next) => {
				if (live) setAd((loaded = next));
				else next.destroy();
			})
			.catch(() => undefined);
		return () => {
			live = false;
			loaded?.destroy();
			setAd(null);
		};
	}, [show]);

	if (!show || !ad) return null;

	return (
		<View className={cn("mx-4 mt-6", className)}>
			{/* the ad's own view takes no classes (Uniwind styles React Native's components), so the box is a View */}
			<NativeAdView nativeAd={ad}>
				<View className="flex-row gap-3 rounded-md border border-border p-3">
					<NativeMediaView resizeMode="cover" style={{ width: MEDIA, height: MEDIA, borderRadius: 6 }} />
					<View className="flex-1 pr-4">
						<View className="flex-row items-center gap-1.5">
							<Badge label="Ad" tone="warning" />
							{ad.advertiser ? (
								<NativeAsset assetType={NativeAssetType.ADVERTISER}>
									<Text variant="caption" numberOfLines={1} className="flex-1">{ad.advertiser}</Text>
								</NativeAsset>
							) : null}
						</View>
						<NativeAsset assetType={NativeAssetType.HEADLINE}>
							<Text variant="label" numberOfLines={2} className="mt-1.5">{ad.headline}</Text>
						</NativeAsset>
						{ad.body ? (
							<NativeAsset assetType={NativeAssetType.BODY}>
								<Text variant="caption" numberOfLines={2} className="mt-0.5">{ad.body}</Text>
							</NativeAsset>
						) : null}
						{ad.callToAction ? (
							<View className="mt-auto flex-row pt-2">
								<NativeAsset assetType={NativeAssetType.CALL_TO_ACTION}>
									<Text variant="small" className="overflow-hidden rounded-md border border-border px-3 py-1.5 font-semibold">{ad.callToAction}</Text>
								</NativeAsset>
							</View>
						) : null}
					</View>
				</View>
			</NativeAdView>
			{available ? (
				<Pressable accessibilityRole="button" hitSlop={8} onPress={openRemoveAds} className="self-start pt-1.5 active:opacity-60">
					<Text variant="caption" className="font-semibold text-link">Remove ads{price ? ` · ${price}` : ""}</Text>
				</Pressable>
			) : null}
		</View>
	);
}
