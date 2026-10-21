"use client";

// Every site page, inside a universe. The universe is applied in the browser and
// the same view builders + page components as the real site render the result.

import { use, useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { CircleAlert, FlaskConical, GitCompareArrows, Orbit, Sparkles, X } from "lucide-react";
import { publishActiveUniverse, UniverseProvider, withdrawActiveUniverse } from "@/components/universe-link";
import { HomePage } from "@/components/pages/home";
import { SeasonPage, SeasonsPage } from "@/components/pages/season";
import { RacePage } from "@/components/pages/race";
import { ConstructorsPage, DriversPage } from "@/components/pages/people";
import { CircuitPage, CircuitsPage, ConstructorPage, DriverPage } from "@/components/pages/profiles";
import { GrandPrixPage, GrandsPrixPage, NationPage, NationsPage, SupplierPage, SuppliersPage } from "@/components/pages/entities";
import { RecordCategoryPage, RecordsPage } from "@/components/pages/records";
import { DiaryIndexPage, DiaryPage } from "@/components/pages/diary";
import { diaryIndexView, diaryView, parseDiarySlug } from "@/lib/f1/diary";
import { recordCategoryView, recordsIndexView } from "@/lib/f1/records";
import { UniverseDiffPage } from "@/components/pages/universe-diff";
import { PointsPage } from "@/components/pages/points";
import { MilestonesPage } from "@/components/pages/milestones";
import { TeammatePairPage } from "@/components/pages/teammates";
import { ComparePage } from "@/components/pages/compare";
import { pointsCompareView } from "@/lib/f1/points-compare";
import { milestonesView, milestoneWatch } from "@/lib/f1/milestones";
import { seasonProgression } from "@/lib/f1/progression";
import { driverTeammatesView, teammatePairView } from "@/lib/f1/teammates";
import { compareQuery, compareView } from "@/lib/f1/compare";
import { ShareButton, SharedActions } from "@/components/lab/share-button";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Spinner } from "@/components/ui/spinner";
import type { Db } from "@/lib/f1/dataset";
import * as v from "@/lib/f1/views";
import { useUniverseDb } from "@/lib/universe/use-universe";
import { universeDiff } from "@/lib/universe/diff";
import { isShared } from "@/lib/universe/store";

function render(db: Db, base: Db, path: string[], uid: string, name: string, searchParams: URLSearchParams): React.ReactNode | null {
	const [section, a, b] = path;
	switch (section) {
		case undefined:
			return <HomePage view={v.homeView(db)} universeName={name} milestones={milestoneWatch(db)} />;
		case "seasons": {
			if (!a) return <SeasonsPage view={v.seasonsView(db, base)} />;
			const view = v.seasonView(db, Number(a), base);
			return view && <SeasonPage view={view} progression={seasonProgression(db, Number(a))} />;
		}
		case "races": {
			const view = v.raceView(db, Number(a), Number(b), base);
			return view && <RacePage view={view} labHref={`/lab?u=${uid}&race=${view.raceId}`} />;
		}
		case "drivers": {
			if (!a) return <DriversPage view={v.driversView(db)} />;
			const view = v.driverView(db, decodeURIComponent(a), base);
			return view && <DriverPage view={view} teammates={driverTeammatesView(db, decodeURIComponent(a))} />;
		}
		case "teammates": {
			const view = a && b ? teammatePairView(db, decodeURIComponent(a), decodeURIComponent(b), base) : null;
			return view && <TeammatePairPage view={view} />;
		}
		case "compare": {
			const { kind, ids } = compareQuery(searchParams);
			return <ComparePage view={compareView(db, kind, ids, base)} />;
		}
		case "points":
			return <PointsPage view={pointsCompareView(db, base)} db={db} />;
		case "milestones":
			return <MilestonesPage view={milestonesView(db)} />;
		case "constructors": {
			if (!a) return <ConstructorsPage view={v.constructorsView(db)} />;
			const view = v.constructorView(db, decodeURIComponent(a), base);
			return view && <ConstructorPage view={view} />;
		}
		case "circuits": {
			if (!a) return <CircuitsPage view={v.circuitsView(db)} />;
				const view = v.circuitView(db, decodeURIComponent(a));
				return view && <CircuitPage view={view} />;
			}
			case "grands-prix": {
				if (!a) return <GrandsPrixPage view={v.grandsPrixView(db)} />;
				const view = v.grandPrixView(db, decodeURIComponent(a));
				return view && <GrandPrixPage view={view} />;
			}
			case "engines": {
				if (!a) return <SuppliersPage view={v.enginesView(db)} />;
				const view = v.engineView(db, decodeURIComponent(a), base);
				return view && <SupplierPage view={view} />;
			}
			case "tyres": {
				if (!a) return <SuppliersPage view={v.tyresView(db)} />;
				const view = v.tyreView(db, decodeURIComponent(a), base);
				return view && <SupplierPage view={view} />;
			}
			case "nations": {
				if (!a) return <NationsPage view={v.nationsView(db)} />;
				const view = v.nationView(db, decodeURIComponent(a));
				return view && <NationPage view={view} />;
			}
		case "diary": {
			if (!a) return <DiaryIndexPage view={diaryIndexView(db)} />;
			const d = parseDiarySlug(a);
			return d && <DiaryPage view={diaryView(db, d.month, d.day)} />;
		}
		case "records": {
			if (!a) return <RecordsPage view={recordsIndexView(db, base)} />;
			const view = recordCategoryView(db, path.slice(1).map(decodeURIComponent).join("/"), base);
			return view && <RecordCategoryPage view={view} />;
		}
		case "changes":
			return !a && <UniverseDiffPage view={universeDiff(db, base)} db={db} base={base} name={name} />;
	}
	return null;
}

function State({ icon, title, description, action }: { icon: React.ReactNode; title: string; description?: string; action?: React.ReactNode }) {
	return (
		<Empty className="min-h-[60vh]">
			<EmptyHeader>
				<EmptyMedia variant="icon">{icon}</EmptyMedia>
				<EmptyTitle>{title}</EmptyTitle>
				{description && <EmptyDescription>{description}</EmptyDescription>}
			</EmptyHeader>
			{action && <EmptyContent>{action}</EmptyContent>}
		</Empty>
	);
}

export default function UniversePage({ params }: { params: Promise<{ uid: string; path?: string[] }> }) {
	const { uid, path = [] } = use(params);
	const state = useUniverseDb(uid);
	const router = useRouter();
	const [leaving, setLeaving] = useState(false);
	// lets the header's search find this universe's own drivers, teams and seasons
	useEffect(() => {
		if (state.status !== "ready") return;
		const u = { id: uid, db: state.db, base: state.base };
		publishActiveUniverse(u);
		return () => withdrawActiveUniverse(u);
	}, [state, uid]);
	// pages that only exist inside a universe go back to the real home page
	const realHref = path[0] === "changes" ? "/" : "/" + path.join("/");

	const searchParams = useSearchParams();
	const content = useMemo(
		() => (state.status === "ready" ? render(state.db, state.base, path, uid, state.universe.name, searchParams) : null),
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[state, path.join("/"), uid, searchParams.toString()],
	);

	if (leaving) return <State icon={<Spinner />} title="Leaving this universe" />;
	if (state.status === "loading")
		return (
			<State
				icon={<Spinner />}
				title="Building this universe"
				description={
					state.progress
						? `Simulating ${state.progress.year} · ${Math.round((100 * state.progress.done) / state.progress.total)}%`
						: "Applying your changes to 75 years of results."
				}
			/>
		);
	if (state.status === "error") return <State icon={<CircleAlert />} title="Couldn't load this universe" description={state.message} />;
	if (state.status === "missing")
		return (
			<State
				icon={<Orbit />}
				title="Universe not found"
				description="Universes are stored in the browser they were made in. To open someone else's, ask them for its share link."
				action={
					<Link href="/lab" className={cn(buttonVariants())}>
						<FlaskConical data-icon="inline-start" />
						Open the Lab
					</Link>
				}
			/>
		);

	const changes = state.universe.changes.length;
	const seasons = state.db.modifiedYears?.size ?? 0;
	const shared = isShared(state.universe);
	return (
		<UniverseProvider universe={{ id: uid, name: state.universe.name }}>
			<div className="bg-universe/8 border-universe/20 border-b">
				<div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2 text-sm sm:px-6 lg:px-10">
					<span className="text-universe flex items-center gap-1.5 font-medium">
						<Sparkles className="size-4" /> {state.universe.name}
					</span>
					{shared && (
						<Badge variant="outline" className="border-universe/30 text-universe">
							Shared with you
						</Badge>
					)}
					<span className="text-muted-foreground">
						{changes} change{changes === 1 ? "" : "s"} · {seasons} season{seasons === 1 ? "" : "s"} affected
					</span>
					<span className="ml-auto flex flex-wrap items-center gap-1">
						<Link href={`/u/${uid}/changes`} className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}>
							<GitCompareArrows data-icon="inline-start" />
							What changed
						</Link>
						<ShareButton universe={state.universe} variant="ghost" size="sm" />
						{shared ? (
							<SharedActions
								universe={state.universe}
								onDiscard={() => {
									setLeaving(true);
									router.replace(realHref);
								}}
							/>
						) : (
							<Link href={`/lab?u=${uid}`} className={cn(buttonVariants({ variant: "ghost", size: "sm", className: "text-universe hover:text-universe" }))}>
								<FlaskConical data-icon="inline-start" />
								Edit in Lab
							</Link>
						)}
						<Link href={realHref} className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}>
							<X data-icon="inline-start" />
							Back to reality
						</Link>
					</span>
				</div>
			</div>
			{content ?? <State icon={<CircleAlert />} title="Page not found in this universe" />}
		</UniverseProvider>
	);
}
