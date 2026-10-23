// The dream championship: the team's five driver-seasons against the highest-rated seasons of
// fifteen other drivers, eight races in the simulator. Standings first, then race by race.

import { Dices, Play } from "lucide-react-native";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { DNF, DREAM_DEFAULTS, simulateDream, type DreamCars, type DreamResult, type Pool, type Team } from "@pitwall/core/game/fantasy";
import { hash } from "@pitwall/core/sim/random";
import { Flag } from "@/components/f1";
import { Badge, Button, Section, Segmented, Text } from "@/components/ui";
import { Switch, switchHaptic } from "@/components/ui/switch";
import { cn } from "@/lib/cn";
import { haptic } from "@/lib/haptics";
import { FinishChip, nationFlag } from "./shared";

export function DreamRace({ pool, team, seedKey }: { pool: Pool; team: Team; seedKey: string }) {
	const { data } = pool;
	const [cars, setCars] = useState<DreamCars>("own");
	const [period, setPeriod] = useState(false);
	const [seed, setSeed] = useState(() => hash("dream", seedKey));
	const [result, setResult] = useState<{ key: string; r: DreamResult } | null>(null);
	// a result only stands for the settings it was run with
	const key = `${team.drivers.join(",")}|${team.constructor}|${cars}|${period}|${seed}`;
	const shown = result?.key === key ? result.r : null;
	const run = (s = seed) => {
		haptic("press");
		setResult({ key: `${team.drivers.join(",")}|${team.constructor}|${cars}|${period}|${s}`, r: simulateDream(pool, team, { ...DREAM_DEFAULTS, seed: s, cars, periodReliability: period }) });
	};
	const name = (id: string) => {
		const s = pool.ds.get(id)!;
		return `${data.drivers[s.d][0]} ${s.y}`;
	};
	const options: { value: DreamCars; label: string }[] = [
		{ value: "own", label: "Own cars" },
		...(team.constructor ? [{ value: "constructor" as const, label: "Your car" }] : []),
		{ value: "equal", label: "Equal cars" },
	];

	return (
		<Section
			title="Dream championship"
			description="Your five drivers against the highest-rated seasons of 15 other drivers, over eight races in the simulator. Ratings measure each driver and car against their own season's field, so this pits how dominant each season was, not raw lap times."
		>
			<View className="mt-2 gap-1 px-4">
				<Segmented
					value={cars}
					options={options}
					onChange={(v) => {
						haptic("selection");
						setCars(v);
					}}
				/>
				<Text variant="caption">
					{cars === "own" ? "Each driver in their own season's car." : cars === "constructor" ? "Your drivers all in your constructor's car." : "Everyone in the same car: driver skill alone."}
				</Text>
				<Pressable accessibilityRole="switch" accessibilityState={{ checked: period }} onPress={() => {
						switchHaptic(!period);
						setPeriod(!period);
					}} className="min-h-12 flex-row items-center justify-between gap-3">
					<Text variant="body">Period reliability</Text>
					<View pointerEvents="none">
						<Switch value={period} accessibilityLabel="Period reliability" />
					</View>
				</Pressable>
				<View className="flex-row gap-2">
					<Button label={shown ? "Run again" : "Start the championship"} icon={Play} className="flex-1" onPress={() => run()} />
					{shown ? (
						<Button
							label="Re-roll"
							icon={Dices}
							variant="outline"
							onPress={() => {
								const s = hash(seed, "reroll");
								setSeed(s);
								run(s);
							}}
						/>
					) : null}
				</View>
			</View>

			{shown ? (
				<>
					<Text variant="label" className="mt-5 px-4">
						Standings
					</Text>
					<View className="mt-1">
						{shown.standings.map((s, i) => (
							<View key={s.id} className={cn("flex-row items-start gap-3 border-b border-border px-4 py-2.5", s.mine && "bg-primary/5")}>
								<Text variant="small" className="w-6 pt-0.5 tabular-nums text-muted-foreground">
									{i + 1}
								</Text>
								<View className="flex-1 gap-1">
									<View className="flex-row items-center gap-1.5">
										<Flag code={nationFlag(pool, data.drivers[s.season.d][1])} />
										<Text variant="label" numberOfLines={1} className={cn("shrink", !s.mine && "font-normal")}>
											{data.drivers[s.season.d][0]}
										</Text>
										<Text variant="muted" className="tabular-nums">
											{s.season.y}
										</Text>
										{s.mine ? <Badge label="Yours" tone="primary" /> : null}
									</View>
									<View className="flex-row flex-wrap gap-0.5">
										{s.finishes.map((f, k) => (
											<FinishChip key={k} f={f || DNF} label={f ? String(f) : "R"} />
										))}
									</View>
								</View>
								<View className="items-end">
									<Text variant="label" className="tabular-nums">
										{s.points}
									</Text>
									{s.wins ? (
										<Text variant="caption" className="tabular-nums">
											{s.wins} {s.wins === 1 ? "win" : "wins"}
										</Text>
									) : null}
								</View>
							</View>
						))}
					</View>
					<Text variant="label" className="mt-5 px-4">
						Races
					</Text>
					<View className="mt-1">
						{shown.races.map((r) => (
							<View key={r.name} className="flex-row items-start gap-3 border-b border-border px-4 py-2.5">
								<Flag code={r.country} />
								<View className="flex-1">
									<Text variant="small" className="text-muted-foreground">
										{r.name}
									</Text>
									<Text variant="label" className={cn(!team.drivers.includes(r.order[0]) && "font-normal")}>
										{r.order[0] ? name(r.order[0]) : "–"}
									</Text>
									<Text variant="caption">{r.order.slice(1, 3).map(name).join(", ")}</Text>
								</View>
							</View>
						))}
					</View>
				</>
			) : null}
		</Section>
	);
}
