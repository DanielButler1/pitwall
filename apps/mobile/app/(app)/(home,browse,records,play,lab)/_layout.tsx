import { Stack, useFocusEffect } from "expo-router";
import { useCallback } from "react";
import type { TabGroup } from "@/components/shell/navigation";
import { currentTab } from "@/lib/links";

/**
 * Every tab's stack. This folder's routes exist in all five tabs, so a driver or a race opens on
 * top of whichever tab you're in (src/lib/links.ts `useOpen`); each tab starts at its own root.
 */
export const unstable_settings = {
	"(home)": { initialRouteName: "index" },
	"(browse)": { initialRouteName: "browse" },
	"(records)": { initialRouteName: "records/index" },
	"(play)": { initialRouteName: "play/index" },
	"(lab)": { initialRouteName: "lab/index" },
};

/** `segment` is the tab this copy of the stack belongs to, e.g. "(browse)". */
export default function TabStack({ segment }: { segment: string }) {
	useFocusEffect(useCallback(() => currentTab.set(segment as TabGroup), [segment]));
	return <Stack screenOptions={{ headerShown: false }} />;
}
