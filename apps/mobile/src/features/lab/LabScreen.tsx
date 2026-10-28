// The Lab's tab: your universes, the ones shared with you, ideas to start from, and importing.

import { FileInput, Inbox, Lightbulb, Orbit, Plus } from "lucide-react-native";
import { useEffect, useState } from "react";
import { View } from "react-native";
import type { Change } from "@pitwall/core/universe/apply";
import { Page, TabScreen } from "@/components/f1";
import { alert, Badge, Button, IconButton, Row, Section, Text, TextField } from "@/components/ui";
import { useRealDb } from "@/data/dataset";
import { fmtDate, plural } from "@/lib/format";
import { haptic } from "@/lib/haptics";
import { useOpen } from "@/lib/links";
import { warmRatings } from "./engine/apply";
import { openSharedUniverse } from "./engine/share";
import { createUniverse, enteredStore, importUniverse, useUniverses, type StoredUniverse } from "./engine/store";

const PRESETS: { name: string; description: string; changes: Change[] }[] = [
	{
		name: "Modern points for all history",
		description: "Every season since 1950 scored 25-18-15, with every result counting.",
		changes: [{ id: "p1", kind: "points", fromYear: 1950, toYear: new Date().getFullYear(), system: "2010" }],
	},
	{
		name: "Abu Dhabi 2021, reversed",
		description: "Hamilton wins the final race and an eighth title.",
		changes: [{ id: "p2", kind: "race-edit", raceId: 1057, order: ["lewis-hamilton", "max-verstappen"], retired: [] }],
	},
	{
		name: "Formula 1 to 2075",
		description: "Careers simulated from 1990: who makes it, who retires, and fifty seasons nobody has raced yet.",
		changes: [{ id: "p4", kind: "history-sim", mode: "dynamic", fromYear: 1990, toYear: 2075, seed: 2075, chaos: 1, reliability: 1 }],
	},
	{
		name: "Senna in the Williams",
		description: "Senna and Mansell swap seats for 1992, and the season is run again.",
		changes: [{ id: "p5", kind: "driver-swap", year: 1992, driverA: "ayrton-senna", driverB: "nigel-mansell" }],
	},
	{
		name: "No Schumacher",
		description: "Michael Schumacher never races in Formula 1.",
		changes: [{ id: "p3", kind: "remove-driver", driverId: "michael-schumacher", fromYear: 1991, toYear: 2012 }],
	},
];

export function LabScreen() {
	const base = useRealDb();
	const universes = useUniverses();
	const entered = enteredStore.use();
	const open = useOpen();
	const [importing, setImporting] = useState(false);
	const [text, setText] = useState("");

	// the first simulation needs the ratings; derive them while the user looks around
	useEffect(() => {
		const t = setTimeout(() => warmRatings(base), 1500);
		return () => clearTimeout(t);
	}, [base]);

	const own = universes.filter((u) => !u.shared);
	const shared = universes.filter((u) => u.shared);
	const create = (name = "Untitled universe", changes: Change[] = []) => {
		const u = createUniverse(name, changes.map((c) => ({ ...c })));
		haptic("success");
		open(`/lab/${u.id}`);
	};
	const doImport = async () => {
		const s = text.trim();
		try {
			// a share link, or the JSON from "Copy JSON"
			const id = s.startsWith("{") ? importUniverse(s).id : (await openSharedUniverse(s)).id;
			haptic("success");
			setText("");
			setImporting(false);
			open(`/lab/${id}`);
		} catch (e) {
			haptic("error");
			alert("Couldn’t import that", (e as Error).message);
		}
	};
	const universeRow = (u: StoredUniverse, i: number, all: StoredUniverse[]) => (
		<Row
			key={u.id}
			icon={Orbit}
			title={u.name}
			subtitle={`${plural(u.changes.length, "change")} · edited ${fmtDate(new Date(u.updatedAt).toISOString())}`}
			trailing={u.id === entered ? <Badge label="Showing" tone="primary" /> : null}
			onPress={() => open(`/lab/${u.id}`)}
			last={i === all.length - 1}
		/>
	);

	return (
		<TabScreen title="Lab" right={<IconButton icon={Plus} label="New universe" onPress={() => create()} />}>
			<Page>
				<Text variant="muted" className="px-4 pt-1">
					Re-run races or whole eras, simulate careers into the future, tune drivers and cars, swap seats, change results or points systems, then browse seasons, careers and records as if it really happened.
				</Text>

				<Section title="Your universes" action={<Button label="New" icon={Plus} variant="outline" size="sm" onPress={() => create()} />}>
					{own.length ? own.map(universeRow) : <Text variant="muted" className="px-4 py-3">None yet. Start from an idea below, or make a new one.</Text>}
				</Section>

				{shared.length ? (
					<Section title="Shared with you">
						{shared.map((u, i, all) => (
							<View key={u.id}>{universeRow(u, i, all)}</View>
						))}
					</Section>
				) : null}

				<Section title="Start from an idea">
					{PRESETS.map((p, i) => (
						<Row key={p.name} icon={Lightbulb} title={p.name} subtitle={p.description} onPress={() => create(p.name, p.changes)} last={i === PRESETS.length - 1} />
					))}
				</Section>

				<Section>
					<Row icon={importing ? Inbox : FileInput} title="Import a universe" subtitle="Paste a share link, or the JSON from Copy JSON" onPress={() => setImporting((v) => !v)} chevron={false} last={!importing} />
					{importing ? (
						<View className="gap-2 px-4 pb-2">
							<TextField value={text} onChangeText={setText} multiline placeholder='https://pitwall.phaseo.app/share#… or {"pitwall":1,…}' autoCapitalize="none" autoCorrect={false} className="min-h-28 font-mono text-[12px]" textAlignVertical="top" />
							<Button label="Import" disabled={!text.trim()} onPress={doImport} />
						</View>
					) : null}
				</Section>
				<Text variant="caption" className="px-4 pt-4">
					Universes are kept on this phone. Share links open in the app and on the website.
				</Text>
			</Page>
		</TabScreen>
	);
}
