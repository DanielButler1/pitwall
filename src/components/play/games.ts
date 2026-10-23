// Every game on /play, shared by the hub and the home page.

import {
	ArrowUpDown,
	CalendarSearch,
	ChartSpline,
	Factory,
	Grid3x3,
	History,
	Link2,
	MapPin,
	Milestone,
	Target,
	Trophy,
	UserSearch,
	Users,
	type LucideIcon,
} from "lucide-react";

export type Game = { id: string; href: string; icon: LucideIcon; title: string; description: string };

export const DAILY: Game[] = [
	{ id: "guess", href: "/play/guess", icon: UserSearch, title: "Guess the driver", description: "Eight guesses to find the mystery driver, with clues from nationality, career span, teams, starts, wins and titles." },
	{ id: "career", href: "/play/career", icon: Milestone, title: "Career path", description: "A driver's career, one team at a time. Every wrong guess reveals the next stop." },
	{ id: "grid", href: "/play/grid", icon: Grid3x3, title: "Grid of nine", description: "Fill a 3×3 grid with drivers who fit both the row and the column. Rarer picks score more." },
	{ id: "chain", href: "/play/chain", icon: Link2, title: "Teammate chain", description: "Link two drivers through teammates, in as few steps as you can." },
	{ id: "constructor", href: "/play/constructor", icon: Factory, title: "Guess the constructor", description: "Find the mystery team from its nationality, seasons, engines, wins and titles." },
	{ id: "circuit", href: "/play/circuit", icon: MapPin, title: "Guess the circuit", description: "Find the mystery track from its country, layout and history, with distance and direction clues." },
	{ id: "race", href: "/play/race", icon: Trophy, title: "Guess the race", description: "Name the Grand Prix from its podium. Each wrong guess reveals another clue." },
	{ id: "lap-chart", href: "/play/lap-chart", icon: ChartSpline, title: "Lap chart mystery", description: "A real lap-by-lap chart with the names hidden. Which race was it?" },
	{ id: "name-the-grid", href: "/play/name-the-grid", icon: Users, title: "Name the grid", description: "Name every driver on a starting grid before the clock runs out." },
	{ id: "predict", href: "/play/predict", icon: Target, title: "Race prediction", description: "Pick the top six of a historical race from its grid, then see how close you were." },
	{ id: "higher-lower", href: "/play/higher-lower", icon: ArrowUpDown, title: "Higher or lower", description: "More wins? More poles? Ten rounds a day, or play endless and chase your best streak." },
	{ id: "season", href: "/play/season", icon: CalendarSearch, title: "Guess the season", description: "Name the championship year from its calendar, champion and rivals. Each wrong guess reveals another clue." },
];

export const MORE: (Game & { tag: string })[] = [
	{ id: "fantasy", href: "/play/fantasy", icon: History, title: "Fantasy: Through the Eras", description: "Build a team from drivers and constructors across Formula 1 history and see how it scores.", tag: "Fantasy" },
];
