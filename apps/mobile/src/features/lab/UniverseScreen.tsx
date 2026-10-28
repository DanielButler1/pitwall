// /lab/<id>: one universe. Its name, its changes (applied in order on top of real history), what
// they do to the championships, every kind of change to add, and the ways out: explore it, share
// it, copy its JSON, duplicate or delete it.

import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import { BookmarkPlus, Copy, FileJson, GitCompareArrows, LogOut, Orbit, Share2, Trash2 } from "lucide-react-native";
import { useMemo, useState } from "react";
import { Share, View } from "react-native";
import { championChanges, describeChange } from "@pitwall/core/universe/apply";
import { DetailScreen, Page, Stat, StatGrid } from "@/components/f1";
import { alert, Button, confirm, EmptyState, IconButton, Row, Section, Text, TextField, toast } from "@/components/ui";
import { useRealDb } from "@/data/dataset";
import { plural } from "@/lib/format";
import { haptic } from "@/lib/haptics";
import { href, useOpen, useTabGroup } from "@/lib/links";
import { ProgressBar, Working } from "./components/previews";
import { EDITORS } from "./editors";
import { universeKey, useApplied } from "./engine/apply";
import { shareUniverse } from "./engine/share";
import { deleteUniverse, duplicateUniverse, editUniverse, enterUniverse, enteredStore, exportUniverse, keepShared, leaveUniverse, useUniverse } from "./engine/store";
import { driverName, shortName, teamName } from "./helpers";

export function UniverseScreen() {
	const { id } = useLocalSearchParams<{ id: string }>();
	const router = useRouter();
	const open = useOpen();
	const group = useTabGroup();
	const base = useRealDb();
	const universe = useUniverse(id);
	const entered = enteredStore.use() === id;
	const applied = useApplied(base, universe ? universeKey(universe) : null, universe?.changes ?? null, { channel: `lab:${id}` });
	const impact = useMemo(() => (applied.db ? championChanges(base, applied.db) : []), [base, applied.db]);
	const [name, setName] = useState(universe?.name ?? "");
	const [showAllImpact, setShowAllImpact] = useState(false);

	if (!universe)
		return (
			<DetailScreen title="Lab">
				<EmptyState icon={Orbit} title="Universe not found" body="It may have been deleted." />
			</DetailScreen>
		);

	const building = applied.pending || !applied.db;
	const seasons = applied.db?.modifiedYears?.size ?? 0;
	const rename = () => {
		const v = name.trim();
		if (v && v !== universe.name) editUniverse(universe.id, { name: v });
		else setName(universe.name);
	};
	const explore = () => {
		enterUniverse(universe.id);
		haptic("success");
		router.navigate("/(home)" as Href);
	};
	const openSeason = (year: number) => {
		if (!entered) enterUniverse(universe.id);
		open(href.season(year));
	};
	const share = async () => {
		try {
			const { long } = await shareUniverse(universe);
			if (long) alert("It’s a long link", "Some chat apps and email clients cut long links off. If it doesn’t open, send the JSON instead (More, Copy JSON).");
		} catch (e) {
			alert("Couldn’t share this universe", (e as Error).message);
		}
	};
	const confirmDelete = async () => {
		const sure = await confirm({
			title: `Delete “${universe.name}”?`,
			body: `This removes the universe and its ${plural(universe.changes.length, "change")} from this phone. Share links you have sent keep working.`,
			confirmLabel: "Delete",
			destructive: true,
		});
		if (!sure) return;
		haptic("success");
		router.back();
		deleteUniverse(universe.id);
		toast(`Deleted “${universe.name}”`);
	};
	const impactShown = showAllImpact ? impact : impact.slice(0, 12);

	return (
		<DetailScreen title={universe.name} subtitle={universe.shared ? "Shared with you" : "Universe"} right={<IconButton icon={Share2} label="Share this universe" onPress={share} />}>
			<Page>
				{universe.shared ? (
					<View className="mx-4 mt-2 gap-3">
						<Text variant="muted">Someone shared this universe with you. Save it to keep it with your own, or edit it to make it yours.</Text>
						<Button label="Save to my Lab" icon={BookmarkPlus} variant="outline" onPress={() => (keepShared(universe.id), haptic("success"), toast("Saved to your Lab"))} />
					</View>
				) : null}
				<View className="mt-3 px-4">
					<Text variant="caption" className="mb-1">
						Name
					</Text>
					<TextField value={name} onChangeText={setName} onBlur={rename} onSubmitEditing={rename} returnKeyType="done" maxLength={120} accessibilityLabel="Universe name" />
				</View>
				<View className="mt-4 gap-2 px-4">
					{entered ? (
						<>
							<Text variant="small" className="text-universe">
								The app is showing this universe.
							</Text>
							<Button label="Back to reality" icon={LogOut} variant="outline" onPress={() => (leaveUniverse(), haptic("toggleOff"))} />
						</>
					) : (
						<Button label="Explore this universe" icon={Orbit} onPress={explore} className="bg-universe" />
					)}
				</View>

				{building && universe.changes.length ? (
					<View className="mt-3 gap-1">
						<Working pending progress={applied.progress} label="Applying changes" />
						<ProgressBar fraction={applied.progress?.fraction ?? null} />
					</View>
				) : null}
				{applied.error ? <Text className="mt-3 px-4 text-destructive">{applied.error}</Text> : null}

				<StatGrid className="mt-4">
					<Stat label="Changes" value={universe.changes.length} />
					<Stat label="Seasons altered" value={building ? "…" : seasons} />
				</StatGrid>

				<Section title="Changes" description="Applied in order, on top of real history.">
					{universe.changes.length === 0 ? (
						<Text variant="muted" className="px-4 py-3">
							No changes yet, so this universe is still reality.
						</Text>
					) : (
						universe.changes.map((c, i) => {
							const d = describeChange(base, c);
							return (
								<Row
									key={c.id}
									leading={<Text variant="label" className="w-6 text-center tabular-nums">{i + 1}</Text>}
									title={d.title}
									subtitle={d.detail}
									numberOfLines={2}
									trailing={<IconButton icon={Trash2} label={`Remove “${d.title}”`} tone="muted" onPress={() => (editUniverse(universe.id, { changes: universe.changes.filter((x) => x.id !== c.id) }), haptic("selection"))} />}
									last={i === universe.changes.length - 1}
								/>
							);
						})
					)}
				</Section>

				<Section title="Add a change" description="Every change previews its effect before you add it.">
					{EDITORS.map((e, i) => (
						<Row key={e.id} icon={e.icon} title={e.label} subtitle={e.detail} onPress={() => open(`/lab/${universe.id}/${e.id}`)} last={i === EDITORS.length - 1} />
					))}
				</Section>

				<Section
					title="Impact on the championships"
					description={building ? "Working it out…" : `${plural(seasons, "season")} altered${impact.length ? `, ${impact.length} with a different champion` : ""}`}
				>
					{!building && impact.length === 0 ? (
						<Text variant="muted" className="px-4 py-3">
							No titles have changed hands.
						</Text>
					) : null}
					{applied.db
						? impactShown.map((c, i) => {
								const db = applied.db!;
								const drivers = c.real !== c.now;
								const title = drivers ? (c.now ? driverName(db, c.now) : "In progress") : "Drivers’ title unchanged";
								const was = drivers ? (c.real ? `In place of ${shortName(driverName(base, c.real))}` : c.year > base.meta.lastCompletedYear ? "New season" : "No champion") : null;
								const teams = c.realTeam !== c.nowTeam && (c.realTeam || c.nowTeam) ? `Constructors: ${c.realTeam ? teamName(base, c.realTeam) : "–"} → ${c.nowTeam ? teamName(db, c.nowTeam) : "–"}` : null;
								return (
									<Row
										key={c.year}
										leading={<Text variant="label" className="w-11 tabular-nums">{c.year}</Text>}
										title={title}
										subtitle={[was, teams].filter(Boolean).join(" · ")}
										onPress={() => openSeason(c.year)}
										last={i === impactShown.length - 1 && impact.length <= impactShown.length}
									/>
								);
							})
						: null}
					{impact.length > impactShown.length ? <Row title={`Show all ${impact.length}`} onPress={() => setShowAllImpact(true)} last /> : null}
				</Section>

				<Section>
					<Row icon={GitCompareArrows} title="What changed" subtitle="Titles, career totals, race winners and records against reality" onPress={() => open(`/changes?u=${universe.id}`)} last />
				</Section>

				<Section title="More">
					<Row icon={Share2} title="Share a link" subtitle="Opens in the app or on the website" onPress={share} />
					<Row icon={FileJson} title="Copy JSON" subtitle="For importing into another Lab" onPress={() => void Share.share({ message: exportUniverse(universe), title: universe.name })} />
					<Row
						icon={Copy}
						title="Duplicate"
						onPress={() => {
							const copy = duplicateUniverse(universe.id);
							if (copy) {
								haptic("success");
								router.replace(`/(app)/${group}/lab/${copy.id}` as Href);
								toast(`Duplicated as “${copy.name}”`);
							}
						}}
					/>
					<Row icon={Trash2} title="Delete universe" destructive chevron={false} onPress={confirmDelete} last />
				</Section>
			</Page>
		</DetailScreen>
	);
}
