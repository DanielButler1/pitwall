import type { ComponentType } from "react";
import { Armchair, ArrowRightLeft, CalendarRange, Car, Dices, History, ListOrdered, Trophy, UserMinus, UserRoundCog, Gauge, type LucideIcon } from "lucide-react-native";
import type { EditorProps } from "./common";
import { PointsEditor, RaceEditEditor, RaceSimEditor, RemoveDriverEditor, SeasonSimEditor } from "./RaceEditors";
import { CareerEditor, DriverPerformanceEditor, HistorySimEditor, MoveEditor, SwapEditor, TeamPerformanceEditor } from "./SimEditors";

export type EditorKind = { id: string; label: string; detail: string; icon: LucideIcon; Editor: ComponentType<EditorProps> };

/** Every kind of change the website's Lab offers, in its order (its "Seats & careers" tab is three here). */
export const EDITORS: EditorKind[] = [
	{ id: "race-sim", label: "Re-simulate a race", detail: "Run one race again", icon: Dices, Editor: RaceSimEditor },
	{ id: "season-sim", label: "Re-simulate a season", detail: "All of it, or from a round on", icon: CalendarRange, Editor: SeasonSimEditor },
	{ id: "history-sim", label: "Simulate history", detail: "Real grids, or careers into the future", icon: History, Editor: HistorySimEditor },
	{ id: "driver-performance", label: "Driver performance", detail: "Make a driver faster or slower", icon: Gauge, Editor: DriverPerformanceEditor },
	{ id: "team-performance", label: "Team performance", detail: "Make a car faster or slower", icon: Car, Editor: TeamPerformanceEditor },
	{ id: "swap", label: "Swap seats", detail: "Two drivers trade places for a season", icon: ArrowRightLeft, Editor: SwapEditor },
	{ id: "move", label: "Move a driver", detail: "Put a driver in another team", icon: Armchair, Editor: MoveEditor },
	{ id: "career", label: "Debut and retirement", detail: "Start or end a career at another time", icon: UserRoundCog, Editor: CareerEditor },
	{ id: "race-edit", label: "Edit a result", detail: "Reorder a race’s finishers", icon: ListOrdered, Editor: RaceEditEditor },
	{ id: "points", label: "Points system", detail: "Score seasons another way, or your own way", icon: Trophy, Editor: PointsEditor },
	{ id: "remove-driver", label: "Remove a driver", detail: "As if they never raced", icon: UserMinus, Editor: RemoveDriverEditor },
];

export const editorById = (id: string) => EDITORS.find((e) => e.id === id);
