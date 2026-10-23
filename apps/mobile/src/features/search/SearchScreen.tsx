import { Screen, Header, EmptyState } from "@/components/ui";

export function SearchScreen() {
	return (
		<Screen edges={[]}>
			<Header title="Search" />
			<EmptyState title="Search" body="Coming soon." />
		</Screen>
	);
}
