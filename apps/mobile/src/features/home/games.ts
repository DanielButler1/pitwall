// The twelve daily games, for the home page's strip (the website's apps/web/src/components/play/games.ts
// DAILY list). Kept here until the Play section exposes its own list.

import {
	ArrowUpDown,
	CalendarSearch,
	ChartSpline,
	Factory,
	Grid3x3,
	Link2,
	MapPin,
	Milestone,
	Target,
	Trophy,
	UserSearch,
	Users,
	type LucideIcon,
} from "lucide-react-native";

export type DailyGame = { id: string; href: string; icon: LucideIcon; title: string };

export const DAILY_GAMES: DailyGame[] = [
	{ id: "guess", href: "/play/guess", icon: UserSearch, title: "Guess the driver" },
	{ id: "career", href: "/play/career", icon: Milestone, title: "Career path" },
	{ id: "grid", href: "/play/grid", icon: Grid3x3, title: "Grid of nine" },
	{ id: "chain", href: "/play/chain", icon: Link2, title: "Teammate chain" },
	{ id: "constructor", href: "/play/constructor", icon: Factory, title: "Guess the constructor" },
	{ id: "circuit", href: "/play/circuit", icon: MapPin, title: "Guess the circuit" },
	{ id: "race", href: "/play/race", icon: Trophy, title: "Guess the race" },
	{ id: "lap-chart", href: "/play/lap-chart", icon: ChartSpline, title: "Lap chart mystery" },
	{ id: "name-the-grid", href: "/play/name-the-grid", icon: Users, title: "Name the grid" },
	{ id: "predict", href: "/play/predict", icon: Target, title: "Race prediction" },
	{ id: "higher-lower", href: "/play/higher-lower", icon: ArrowUpDown, title: "Higher or lower" },
	{ id: "season", href: "/play/season", icon: CalendarSearch, title: "Guess the season" },
];
