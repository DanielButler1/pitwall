// Race facts (@pitwall/core/f1/race-facts) as sentences: "Did you know" on a race's screen, and what's
// at stake at the next race. Names in the sentence open their screens, like the website's links.

import { CalendarHeart, CloudRain, Crown, Flame, Gauge, Hash, History, Medal, Sparkles, TrafficCone, Trophy, Users, type LucideIcon } from "lucide-react-native";
import { View } from "react-native";
import type { FactKind, RaceFact } from "@pitwall/core/f1/race-facts";
import type { Cell } from "@pitwall/core/f1/records";
import { Icon, Text } from "@/components/ui";
import { cn } from "@/lib/cn";
import { href, useOpen } from "@/lib/links";

const ICON: Partial<Record<FactKind, LucideIcon>> = {
	title: Crown,
	lead: Crown,
	record: Medal,
	ranking: Medal,
	nth: Hash,
	streak: Flame,
	"streak-end": Flame,
	first: Trophy,
	since: History,
	drought: History,
	weather: CloudRain,
	neutral: TrafficCone,
	tyres: Gauge,
	birthday: CalendarHeart,
	family: Users,
	teammate: Users,
	rival: Users,
};

/** A cell's words, and where it leads (none for plain text). */
function part(cell: Cell): [string, string | null] {
	switch (cell.t) {
		case "text":
			return [cell.text, null];
		case "driver":
			return [cell.ref.name, href.driver(cell.ref.id)];
		case "team":
			return [cell.ref.name, href.team(cell.ref.id)];
		case "engine":
			return [cell.ref.name, href.engine(cell.ref.id)];
		case "tyre":
			return [cell.ref.name, href.tyre(cell.ref.id)];
		case "nation":
			return [cell.ref.name, href.nation(cell.ref.id)];
		case "gp":
			return [cell.ref.name, href.grandPrix(cell.ref.id)];
		case "race":
			return [`${cell.ref.year} ${cell.ref.name}`, href.race(cell.ref)];
		case "circuit":
			return [cell.ref.name, href.circuit(cell.ref.id)];
		case "season":
			return [String(cell.year), href.season(cell.year)];
		case "date":
			return [cell.iso, null];
		case "number":
			return [`#${cell.number}`, null];
	}
}

/** One fact as a sentence, its names tappable. */
export function FactSentence({ cells, className }: { cells: Cell[]; className?: string }) {
	const open = useOpen();
	return (
		<Text variant="small" className={cn("leading-5", className)}>
			{cells.map((c, i) => {
				const [words, path] = part(c);
				return path ? (
					<Text key={i} variant="small" className="leading-5 font-semibold text-link" onPress={() => open(path)}>
						{words}
					</Text>
				) : (
					words
				);
			})}
		</Text>
	);
}

/** A list of facts, each with an icon for its kind. */
export function FactList({ facts }: { facts: RaceFact[] }) {
	return (
		<View className="px-4">
			{facts.map((f, i) => (
				<View key={f.key} className={cn("flex-row gap-3 py-2.5", i < facts.length - 1 && "border-b border-border")}>
					<View className="pt-0.5">
						<Icon icon={ICON[f.kind] ?? Sparkles} tone="primary" size={16} />
					</View>
					<FactSentence cells={f.cells} className="flex-1" />
				</View>
			))}
		</View>
	);
}
