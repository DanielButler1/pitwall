import Constants from "expo-constants";
import * as WebBrowser from "expo-web-browser";
import { BadgeCheck, Database, Download, ExternalLink, Globe, History, RefreshCw, Scale, ShieldCheck, Sparkles, Vibrate } from "lucide-react-native";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { Page, DetailScreen } from "@/components/f1";
import { Button, confirm, Fact, Icon, Row, Section, Segmented, Text, toast } from "@/components/ui";
import { Switch } from "@/components/ui/switch";
import { datasetStore, refreshDataset, useRealDb } from "@/data/dataset";
import { adsStore, showAdPrivacyOptions } from "@/features/ads/ads";
import { purchaseStore, restoreAdFree } from "@/features/ads/purchases";
import { openRemoveAds } from "@/features/ads/RemoveAdsSheet";
import { ORIGIN } from "@/lib/config";
import { fmtDate } from "@/lib/format";
import { haptic, hapticsStore, setHapticsEnabled } from "@/lib/haptics";
import { useAppearance, type ThemePreference } from "@/providers/AppearanceProvider";
import { downloadAgain, lastCheckedStore, watchDataChecks } from "./data";

watchDataChecks();

const F1DB = "https://github.com/f1db/f1db";
const JOLPICA = "https://github.com/jolpica/jolpica-f1";
const LICENCE = "https://polyformproject.org/licenses/noncommercial/1.0.0";

const browse = (url: string) => void WebBrowser.openBrowserAsync(url).catch(() => undefined);

/** "just now", "5 minutes ago", "3 hours ago", else the date. */
function ago(ms: number, now: number) {
	const min = Math.round((now - ms) / 60_000);
	if (min < 1) return "Just now";
	if (min < 60) return `${min} ${min === 1 ? "minute" : "minutes"} ago`;
	const h = Math.round(min / 60);
	if (h < 24) return `${h} ${h === 1 ? "hour" : "hours"} ago`;
	return fmtDate(new Date(ms).toISOString());
}

export function SettingsScreen() {
	return (
		<DetailScreen title="Settings">
			<Page>
				<AppearanceSection />
				<AdsSection />
				<DataSection />
				<AboutSection />
			</Page>
		</DetailScreen>
	);
}

function AppearanceSection() {
	const { preference, setPreference } = useAppearance();
	const haptics = hapticsStore.use((s) => s.enabled);
	return (
		<Section title="Appearance" className="mt-2">
			<Text variant="muted" className="px-4 pb-2">
				Theme
			</Text>
			<Segmented<ThemePreference>
				className="mx-4"
				value={preference}
				onChange={(next) => {
					if (next === preference) return;
					haptic("selection");
					setPreference(next);
				}}
				options={[
					{ value: "system", label: "System" },
					{ value: "light", label: "Light" },
					{ value: "dark", label: "Dark" },
				]}
			/>
			<Row
				className="mt-3"
				icon={Vibrate}
				title="Haptic feedback"
				subtitle="Small taps for choices, switches and results"
				trailing={<Switch value={haptics} onValueChange={setHapticsEnabled} accessibilityLabel="Haptic feedback" />}
				last
			/>
		</Section>
	);
}

/** Remove ads (or the thanks once bought), restoring a purchase, and changing ad consent. */
function AdsSection() {
	const { adFree, available, price } = purchaseStore.use();
	const privacyOptions = adsStore.use((s) => s.privacyOptions);
	const [restoring, setRestoring] = useState(false);
	if (!available && !adFree && !privacyOptions) return null;

	const restore = async () => {
		setRestoring(true);
		const found = await restoreAdFree();
		setRestoring(false);
		if (found) {
			haptic("success");
			toast("Purchase restored. Ads removed");
		} else toast(found === false ? "No purchase found for this account" : "Couldn't reach the store. Try again later", { tone: found === false ? "default" : "error" });
	};

	return (
		<Section title="Ads">
			{adFree ? (
				<Row icon={BadgeCheck} title="Ads removed" subtitle="Thank you for supporting Pitwall" last={!available} />
			) : available ? (
				<Row icon={Sparkles} title="Remove ads" subtitle="One payment, on every phone with your store account" value={price} onPress={openRemoveAds} />
			) : null}
			{available ? <Row icon={History} title={restoring ? "Restoring…" : "Restore purchase"} subtitle="After a reinstall or on a new phone" chevron={false} onPress={restoring ? undefined : () => void restore()} last={adFree || !privacyOptions} /> : null}
			{!adFree && privacyOptions ? <Row icon={ShieldCheck} title="Ad privacy choices" subtitle="Change what you agreed to for ads" onPress={() => void showAdPrivacyOptions()} last /> : null}
		</Section>
	);
}

function DataSection() {
	const db = useRealDb();
	const checking = datasetStore.use((s) => s.status === "ready" && s.checking);
	const lastChecked = lastCheckedStore.use();
	const [outcome, setOutcome] = useState<string | null>(null);
	const [now, setNow] = useState(() => Date.now());
	useEffect(() => {
		const t = setInterval(() => setNow(Date.now()), 30_000);
		return () => clearInterval(t);
	}, []);
	const meta = db.meta;
	const jolpica = meta.jolpica;

	const check = async () => {
		setOutcome(null);
		const before = db;
		await refreshDataset();
		const after = datasetStore.get();
		const updated = after.status === "ready" && after.db !== before;
		setOutcome(updated ? "Updated with the latest results." : "You have the latest data.");
		haptic("success");
		setNow(Date.now());
	};

	const again = async () => {
		const sure = await confirm({
			title: "Download the data again?",
			body: "The saved copy is deleted and the whole history downloaded again (about 1 MB). You'll need a connection.",
			confirmLabel: "Download",
			destructive: true,
		});
		if (sure) void downloadAgain();
	};

	return (
		<Section title="Data" description="The whole history is on this phone, so the app works offline.">
			<View className="mt-1">
				<Fact label="F1DB release" value={meta.release?.tag ?? "Development build"} />
				<Fact label="Seasons" value={`${meta.firstYear}–${meta.lastCompletedYear}`} />
				<Fact label="Built" value={fmtDate(meta.generatedAt)} />
				<Fact label="Jolpica dump" value={jolpica?.dumpDate ? fmtDate(jolpica.dumpDate) : undefined} />
				{/* a node rather than a string: Fact's selectable text cut "Just now" to "Just" on Android */}
				<Fact
					label="Last checked"
					value={
						<Text variant="small" className="font-semibold" numberOfLines={1}>
							{checking ? "Checking…" : lastChecked ? ago(lastChecked, now) : "Not yet"}
						</Text>
					}
					last
				/>
			</View>
			<View className="mt-3 gap-2 px-4">
				<Button label={checking ? "Checking for new data" : "Check for new data"} icon={RefreshCw} variant="outline" loading={checking} onPress={() => void check()} />
				{outcome ? (
					<Text variant="muted" className="text-center" accessibilityLiveRegion="polite">
						{outcome}
					</Text>
				) : null}
				<Button label="Download again" icon={Download} variant="destructive" disabled={checking} onPress={again} />
			</View>
		</Section>
	);
}

function AboutSection() {
	const db = useRealDb();
	const meta = db.meta;
	const jolpica = meta.jolpica;
	const version = Constants.expoConfig?.version ?? "–";
	return (
		<Section title="About">
			<Fact label="Version" value={version} />
			<Row icon={Globe} title="Pitwall on the web" subtitle={ORIGIN.replace(/^https?:\/\//, "")} trailing={<Icon icon={ExternalLink} tone="muted" size={16} />} chevron={false} onPress={() => browse(ORIGIN)} />
			<Row icon={Database} title="F1DB" subtitle={`Seasons, results and standings${meta.release ? ` (${meta.release.tag})` : ""}, CC BY 4.0`} trailing={<Icon icon={ExternalLink} tone="muted" size={16} />} chevron={false} onPress={() => browse(F1DB)} />
			{jolpica ? (
				<Row icon={Database} title="Jolpica F1" subtitle="Lap charts, laps led and pit stops (free non-commercial data dump)" trailing={<Icon icon={ExternalLink} tone="muted" size={16} />} chevron={false} onPress={() => browse(JOLPICA)} />
			) : null}
			<Row icon={Scale} title="PolyForm Noncommercial licence" subtitle="Free to use, change and share for non-commercial purposes" trailing={<Icon icon={ExternalLink} tone="muted" size={16} />} chevron={false} onPress={() => browse(LICENCE)} last />
			<Text variant="caption" className="px-4 pt-4 leading-5">
				Data: F1DB{meta.release ? ` ${meta.release.tag}` : ""} (CC BY 4.0), seasons {meta.firstYear}–{meta.lastCompletedYear}.
				{jolpica
					? ` Lap charts, laps led and pit stops: Jolpica F1 (free non-commercial data dump${jolpica.dumpDate ? ` of ${fmtDate(jolpica.dumpDate)}` : ""}, laps since ${jolpica.lapsFrom}${jolpica.pitStopsFrom ? `, pit stops since ${jolpica.pitStopsFrom}` : ""}).`
					: ""}{" "}
				Not affiliated with Formula 1.
			</Text>
		</Section>
	);
}
