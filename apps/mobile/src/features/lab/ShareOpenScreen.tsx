// /lab/share?d=<what follows # in a website share link>: unpacks a shared universe into the Lab
// and shows it (the website's /share#… page).

import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import { CircleAlert } from "lucide-react-native";
import { useEffect, useState } from "react";
import { DetailScreen } from "@/components/f1";
import { EmptyState, LoadingState } from "@/components/ui";
import { haptic } from "@/lib/haptics";
import { useTabGroup } from "@/lib/links";
import { openSharedUniverse } from "./engine/share";

export function ShareOpenScreen() {
	const { d } = useLocalSearchParams<{ d?: string }>();
	const router = useRouter();
	const group = useTabGroup();
	const [failure, setError] = useState<string | null>(null);
	const error = d ? failure : "This link has no universe in it. Was it copied in full?";
	useEffect(() => {
		if (!d) return;
		let alive = true;
		openSharedUniverse(d).then(
			({ id }) => {
				if (!alive) return;
				haptic("success");
				router.replace(`/(app)/${group}/lab/${id}` as Href);
			},
			(e: Error) => {
				if (!alive) return;
				haptic("error");
				setError(e.message);
			},
		);
		return () => {
			alive = false;
		};
	}, [d, group, router]);
	return (
		<DetailScreen title="Shared universe">
			{error ? <EmptyState icon={CircleAlert} title="Couldn’t open this universe" body={error} action="Open the Lab" onAction={() => router.replace(`/(app)/${group}/lab` as Href)} /> : <LoadingState label="Unpacking the changes from the link" />}
		</DetailScreen>
	);
}
