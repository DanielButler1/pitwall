import { Stack } from "expo-router";

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

export default function TabStack() {
	return <Stack screenOptions={{ headerShown: false }} />;
}
