import { Dices, Plus } from "lucide-react-native";
import { useMemo } from "react";
import { View } from "react-native";
import type { Db } from "@pitwall/core/f1/dataset";
import type { Change, UniverseDb } from "@pitwall/core/universe/apply";
import { Button, Text } from "@/components/ui";
import { changesKey, useApplied, type ApplyProgress } from "../engine/apply";
import { Slider } from "../components/Slider";
import { chaosLabel, reliabilityLabel } from "../helpers";

export type EditorProps = {
	/** Real history. */
	base: Db;
	/** The universe as it stands (reality while it's still building). */
	current: Db;
	changes: Change[];
	onAdd: (changes: Change[]) => void;
	/** A race to start from (from a race screen's "Edit in the Lab"). */
	initialRaceId?: number;
};

/** The universe with a candidate change (or several) added, worked out in the background. Keeps the last preview while updating. */
export function usePreview(base: Db, changes: Change[], candidate: Change | Change[] | null, channel = "preview"): { preview: UniverseDb | null; pending: boolean; progress: ApplyProgress | null } {
	const list = useMemo(() => (candidate ? [...changes, ...(Array.isArray(candidate) ? candidate : [candidate])] : null), [changes, candidate]);
	const key = useMemo(() => (list ? changesKey(channel, list) : null), [list, channel]);
	const { db, pending, progress } = useApplied(base, key, list, { channel, debounce: 350 });
	return { preview: candidate ? db : null, pending, progress };
}

export function SimControls({ chaos, setChaos, reliability, setReliability }: { chaos: number; setChaos: (n: number) => void; reliability: number; setReliability: (n: number) => void }) {
	return (
		<>
			<Slider label="Unpredictability" value={chaos} min={0.2} max={2} step={0.1} onChange={setChaos} format={(v) => `${chaosLabel(v)} (${v.toFixed(1)})`} />
			<Slider label="Reliability" value={reliability} min={0} max={2} step={0.1} onChange={setReliability} format={(v) => `${reliabilityLabel(v)} (${v.toFixed(1)})`} last />
		</>
	);
}

/** "Add to universe", with an optional re-roll for the simulators. */
export function AddBar({ onAdd, disabled, seed, onReroll }: { onAdd: () => void; disabled?: boolean; seed?: number; onReroll?: () => void }) {
	return (
		<View className="mt-4 gap-2 px-4">
			<Button label="Add to universe" icon={Plus} onPress={onAdd} disabled={disabled} className="bg-universe" />
			{onReroll ? (
				<View className="flex-row items-center gap-3">
					<Button label="Re-roll" icon={Dices} variant="outline" size="sm" onPress={onReroll} />
					<Text variant="caption" className="tabular-nums">
						Seed {seed}
					</Text>
				</View>
			) : null}
		</View>
	);
}
