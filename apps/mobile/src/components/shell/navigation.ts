import { FlaskConical, Gamepad2, House, LibraryBig, Trophy, type LucideIcon } from "lucide-react-native";

/** Each tab is a route group with its own stack; detail screens are shared by all of them (src/lib/links.ts). */
export type TabGroup = "(home)" | "(browse)" | "(records)" | "(play)" | "(lab)";

/**
 * `href` names its group: every route exists in every tab, so a bare "/browse" would resolve to the first.
 * (Typed routes don't list group paths, so the layout casts them.)
 */
export type NavItem = { name: TabGroup; href: "/(home)" | "/(browse)/browse" | "/(records)/records" | "/(play)/play" | "/(lab)/lab"; label: string; icon: LucideIcon };

/** Every tab must be declared here: Expo Router 58 only shows declared tabs. */
export const NAV_ITEMS: NavItem[] = [
	{ name: "(home)", href: "/(home)", label: "Home", icon: House },
	{ name: "(browse)", href: "/(browse)/browse", label: "Browse", icon: LibraryBig },
	{ name: "(records)", href: "/(records)/records", label: "Records", icon: Trophy },
	{ name: "(play)", href: "/(play)/play", label: "Play", icon: Gamepad2 },
	{ name: "(lab)", href: "/(lab)/lab", label: "Lab", icon: FlaskConical },
];

export const TAB_GROUPS = NAV_ITEMS.map((item) => item.name);
