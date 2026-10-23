import { useLocalSearchParams, useRouter } from "expo-router";
import { DetailScreen, Page } from "@/components/f1";
import { EmptyState } from "@/components/ui";
import { useRealDb } from "@/data/dataset";
import { haptic } from "@/lib/haptics";
import { universeKey, useApplied } from "./engine/apply";
import { editUniverse, useUniverse } from "./engine/store";
import { editorById } from "./editors";

/** /lab/<universe>/<kind>: one kind of change, previewed live, added to the universe. */
export function EditorScreen() {
	const { id, kind, race } = useLocalSearchParams<{ id: string; kind: string; race?: string }>();
	const router = useRouter();
	const base = useRealDb();
	const universe = useUniverse(id);
	const editor = editorById(kind);
	const applied = useApplied(base, universe ? universeKey(universe) : null, universe?.changes ?? null, { channel: `lab:${id}` });
	if (!universe || !editor)
		return (
			<DetailScreen title="Lab">
				<EmptyState title={universe ? "No such kind of change" : "Universe not found"} />
			</DetailScreen>
		);
	const { Editor } = editor;
	return (
		<DetailScreen title={editor.label} subtitle={universe.name}>
			<Page>
				<Editor
					key={universe.id}
					base={base}
					// while the universe is (re)building, previews compare against its last state, or reality
					current={applied.db ?? base}
					changes={universe.changes}
					initialRaceId={race ? Number(race) : undefined}
					onAdd={(changes) => {
						editUniverse(universe.id, { changes: [...universe.changes, ...changes] });
						haptic("success");
						router.back();
					}}
				/>
			</Page>
		</DetailScreen>
	);
}
