"use client";

// /compare in reality. The ids are in the query string, so instead of rendering on the server
// for every combination, the browser loads the dataset (shared with the Lab and universes)
// and builds the comparison itself.

import { useEffect, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { CircleAlert } from "lucide-react";
import { compareQuery, compareView } from "@/lib/f1/compare";
import { useBaseDb } from "@/lib/universe/use-universe";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "../ui/empty";
import { Spinner } from "../ui/spinner";
import { ComparePage } from "./compare";

export function CompareRoute() {
	const searchParams = useSearchParams();
	const { base, error } = useBaseDb();
	const query = searchParams.toString();
	const view = useMemo(() => {
		if (!base) return null;
		const { kind, ids } = compareQuery(new URLSearchParams(query));
		return compareView(base, kind, ids);
	}, [base, query]);

	useEffect(() => {
		const names = view?.entities.map((e) => e.driver?.name ?? e.team?.name).filter(Boolean) ?? [];
		document.title = `${names.length >= 2 ? names.join(" vs ") : "Compare"} | Pitwall`;
	}, [view]);

	if (view) return <ComparePage view={view} />;
	return (
		<Empty className="min-h-[60vh]">
			<EmptyHeader>
				<EmptyMedia variant="icon">{error ? <CircleAlert /> : <Spinner />}</EmptyMedia>
				<EmptyTitle>{error ? "Couldn't load the data" : "Loading every season"}</EmptyTitle>
				<EmptyDescription>{error ?? "Comparisons are worked out in your browser."}</EmptyDescription>
			</EmptyHeader>
		</Empty>
	);
}
