// Picking a driver or constructor to compare: a full-screen sheet with a search box over every
// driver (or constructor), most successful first.

import { LegendList } from "@legendapp/list/react-native";
import { X } from "lucide-react-native";
import { memo, useCallback, useMemo, useState } from "react";
import { Modal, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { constructorsView, driversView } from "@pitwall/core/f1/views";
import { Flag } from "@/components/f1";
import { EmptyState, IconButton, Row, SearchField, Text } from "@/components/ui";
import { useDb } from "@/data/dataset";
import { haptic } from "@/lib/haptics";
import { yearRange } from "@/lib/format";
import type { Db } from "@pitwall/core/f1/dataset";

export type Pickable = { id: string; name: string; country: string | null; detail: string; search: string };

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// Built once per dataset: the whole list of drivers is ~860 rows.
const cache = new WeakMap<Db, { driver: Pickable[]; team: Pickable[] }>();
function pickables(db: Db) {
	let hit = cache.get(db);
	if (!hit) {
		const score = (r: { titles: number; wins: number; podiums: number; starts: number }) => r.titles * 1e6 + r.wins * 1e3 + r.podiums * 10 + r.starts / 1000;
		const driver = [...driversView(db).rows]
			.sort((a, b) => score(b) - score(a))
			.map((r) => ({ id: r.driver.id, name: r.driver.name, country: r.driver.country, detail: [yearRange(r.firstYear, r.lastYear), r.wins ? `${r.wins} wins` : `${r.starts} starts`].filter(Boolean).join(" · "), search: fold(`${r.driver.name} ${r.driver.countryName ?? ""}`) }));
		const team = [...constructorsView(db).rows]
			.sort((a, b) => score(b) - score(a))
			.map((r) => ({ id: r.team.id, name: r.team.name, country: r.team.country, detail: [yearRange(r.firstYear, r.lastYear), r.wins ? `${r.wins} wins` : `${r.starts} races`].filter(Boolean).join(" · "), search: fold(r.team.name) }));
		cache.set(db, (hit = { driver, team }));
	}
	return hit;
}

export function ComparePicker({ kind, visible, taken, onPick, onClose }: { kind: "driver" | "team"; visible: boolean; taken: string[]; onPick(id: string): void; onClose(): void }) {
	const db = useDb();
	const insets = useSafeAreaInsets();
	const [query, setQuery] = useState("");
	const all = useMemo(() => pickables(db)[kind], [db, kind]);
	const hits = useMemo(() => {
		const words = fold(query.trim()).split(/\s+/).filter(Boolean);
		const skip = new Set(taken);
		return all.filter((p) => !skip.has(p.id) && words.every((w) => p.search.includes(w)));
	}, [all, query, taken]);
	const close = () => {
		setQuery("");
		onClose();
	};
	const renderItem = useCallback(
		({ item }: { item: Pickable }) => (
			<PickRow
				item={item}
				onPick={(id) => {
					haptic("selection");
					setQuery("");
					onPick(id);
				}}
			/>
		),
		[onPick],
	);
	return (
		<Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={close}>
			<View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
				<View className="min-h-12 flex-row items-center gap-1 px-2">
					<View className="w-2" />
					<Text variant="heading" className="flex-1">{kind === "driver" ? "Add a driver" : "Add a constructor"}</Text>
					<IconButton icon={X} label="Close" onPress={close} />
				</View>
				<SearchField value={query} onChangeText={setQuery} placeholder={kind === "driver" ? "Search drivers" : "Search constructors"} className="mx-4 mb-2" autoFocus />
				<LegendList
					data={hits}
					renderItem={renderItem}
					keyExtractor={(p) => p.id}
					estimatedItemSize={62}
					recycleItems
					keyboardShouldPersistTaps="handled"
					keyboardDismissMode="on-drag"
					ListEmptyComponent={<EmptyState title={kind === "driver" ? "No driver found" : "No constructor found"} />}
					contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
				/>
			</View>
		</Modal>
	);
}

const PickRow = memo(function PickRow({ item, onPick }: { item: Pickable; onPick(id: string): void }) {
	return <Row leading={<View className="w-7 items-center"><Flag code={item.country} /></View>} title={item.name} subtitle={item.detail} chevron={false} onPress={() => onPick(item.id)} />;
});
