import { View } from "react-native";
import { EmptyState, Screen, Spinner, Text, useToneColor } from "@/components/ui";
import { retryDataset, type DatasetState } from "@/data/dataset";

/** Shown until the dataset is open: the first download, or what went wrong with it. */
export function BootScreen({ state }: { state: DatasetState }) {
	const primary = useToneColor("primary");
	if (state.status === "error") {
		return (
			<Screen className="justify-center">
				<EmptyState
					title="Couldn't download Formula 1 history"
					body={`Pitwall downloads its data once (about 1 MB), then works offline. Check your connection. (${state.message})`}
					action="Try again"
					onAction={retryDataset}
				/>
			</Screen>
		);
	}
	return (
		<Screen className="items-center justify-center px-8">
			<View className="mb-6 h-10 w-3 -skew-x-12 rounded-sm bg-primary" />
			<Spinner color={primary} />
			<Text variant="heading" className="mt-4 text-center">
				{state.status === "downloading" ? "Downloading Formula 1 history" : "Opening Formula 1 history"}
			</Text>
			<Text variant="muted" className="mt-1 text-center">
				{state.status === "downloading" ? "Every season since 1950, about 1 MB. This happens once; after that Pitwall works offline." : "Every season since 1950."}
			</Text>
		</Screen>
	);
}
