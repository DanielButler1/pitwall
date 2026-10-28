import "../global.css";
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import * as SystemUI from "expo-system-ui";
import { useEffect, useMemo, useRef } from "react";
import { AppState } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useCSSVariable } from "uniwind";
import { setGameStorage } from "@pitwall/core/game/daily";
import { BootScreen } from "@/components/shell/BootScreen";
import { FeedbackHost, toast } from "@/components/ui";
import { bootDataset, datasetStore, refreshDataset } from "@/data/dataset";
import { gameStorage } from "@/lib/storage";
import { AppearanceProvider, useAppearance } from "@/providers/AppearanceProvider";
import { QueryProvider } from "@/providers/QueryProvider";

void SplashScreen.preventAutoHideAsync().catch(() => undefined);
// the games keep their saves in the app's SQLite store rather than the web's localStorage
setGameStorage(gameStorage);
void bootDataset();

export default function RootLayout() {
	return (
		<GestureHandlerRootView style={{ flex: 1 }}>
			<SafeAreaProvider>
				<AppearanceProvider>
					<QueryProvider>
						<RootNavigator />
					</QueryProvider>
				</AppearanceProvider>
			</SafeAreaProvider>
		</GestureHandlerRootView>
	);
}

function RootNavigator() {
	const { resolved, ready: appearanceReady } = useAppearance();
	const dataset = datasetStore.use();
	const [background, card, text, border, primary] = useCSSVariable(["--color-background", "--color-card", "--color-foreground", "--color-border", "--color-primary"]);

	// Navigation surfaces (screen backgrounds during transitions) follow the same tokens as the app.
	const theme = useMemo(() => {
		const base = resolved === "dark" ? DarkTheme : DefaultTheme;
		return {
			...base,
			colors: { ...base.colors, background: String(background ?? base.colors.background), card: String(card ?? base.colors.card), text: String(text ?? base.colors.text), border: String(border ?? base.colors.border), primary: String(primary ?? base.colors.primary) },
		};
	}, [resolved, background, card, text, border, primary]);

	useEffect(() => {
		if (background) void SystemUI.setBackgroundColorAsync(String(background));
	}, [background]);

	// The splash stays until the saved dataset is open; on first launch the boot screen takes over.
	const splashDone = appearanceReady && dataset.status !== "loading";
	useEffect(() => {
		if (splashDone) void SplashScreen.hideAsync();
	}, [splashDone]);

	// Say so when the quiet check brings in new results (the first open isn't news).
	const built = dataset.status === "ready" ? dataset.generatedAt : null;
	const shown = useRef<string | null>(null);
	useEffect(() => {
		if (!built) return;
		if (shown.current && shown.current !== built) toast("New results downloaded");
		shown.current = built;
	}, [built]);

	// Back in the foreground after a while: there may be new results.
	useEffect(() => {
		const sub = AppState.addEventListener("change", (state) => {
			if (state === "active") void refreshDataset();
		});
		return () => sub.remove();
	}, []);

	if (!appearanceReady || dataset.status === "loading") return null;

	return (
		<ThemeProvider value={theme}>
			<StatusBar style={resolved === "dark" ? "light" : "dark"} />
			{dataset.status !== "ready" ? (
				<BootScreen state={dataset} />
			) : (
				<Stack screenOptions={{ headerShown: false }}>
					<Stack.Screen name="(app)" />
					<Stack.Screen name="search" options={{ animation: "slide_from_bottom" }} />
					<Stack.Screen name="settings" />
				</Stack>
			)}
			<FeedbackHost />
		</ThemeProvider>
	);
}
