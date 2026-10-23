"use client";

import { ScrollArea } from "@/components/ui/scroll-area";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { ArrowRight, BookmarkPlus, ChevronRight, Copy, FileInput, FlaskConical, GitCompareArrows, Inbox, Lightbulb, Orbit, Plus, Sparkles, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { championChanges, describeChange, type Change, type Universe } from "@pitwall/core/universe/apply";
import {
	createUniverse,
	deleteUniverse,
	exportUniverse,
	importUniverse,
	keepShared,
	listUniverses,
	onUniversesChanged,
	saveUniverse,
	type StoredUniverse,
} from "@/lib/universe/store";
import { useAppliedUniverse, useBaseDb } from "@/lib/universe/use-universe";
import { driverRef, teamRef } from "@pitwall/core/f1/views";
import { DriverLink, SeasonLink, TeamLink } from "@/components/f1";
import { UniverseProvider } from "@/components/universe-link";
import { ShareButton } from "./share-button";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { PointsEditor, RaceEditEditor, RaceSimEditor, RemoveDriverEditor, SeasonSimEditor } from "./editors";
import { DriverPerformanceEditor, HistorySimEditor, SeatsEditor, TeamPerformanceEditor } from "./sim-editors";

const EDITORS = [
	{ id: "race-sim", label: "Re-simulate a race", Editor: RaceSimEditor },
	{ id: "season-sim", label: "Re-simulate a season", Editor: SeasonSimEditor },
	{ id: "history-sim", label: "Simulate history", Editor: HistorySimEditor },
	{ id: "driver-performance", label: "Driver performance", Editor: DriverPerformanceEditor },
	{ id: "team-performance", label: "Team performance", Editor: TeamPerformanceEditor },
	{ id: "seats", label: "Seats & careers", Editor: SeatsEditor },
	{ id: "race-edit", label: "Edit a result", Editor: RaceEditEditor },
	{ id: "points", label: "Points system", Editor: PointsEditor },
	{ id: "remove-driver", label: "Remove a driver", Editor: RemoveDriverEditor },
] as const;

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

/** "M. Schumacher": struck-out names stay on one line on phones. */
const shortRef = <R extends { name: string }>(r: R): R => {
	const [first, ...rest] = r.name.split(" ");
	return rest.length ? { ...r, name: `${first[0]}. ${rest.join(" ")}` } : r;
};

function useUniverses() {
	const [list, setList] = useState<StoredUniverse[] | null>(null);
	useEffect(() => {
		const load = () => listUniverses().then(setList);
		load();
		return onUniversesChanged(load);
	}, []);
	return list;
}

function ImportDialog({ onImported }: { onImported: (u: Universe) => void }) {
	const [open, setOpen] = useState(false);
	const [text, setText] = useState("");
	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button variant="ghost" size="sm" className="text-muted-foreground w-full justify-start">
					<FileInput data-icon="inline-start" />
					Import a universe
				</Button>
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Import a universe</DialogTitle>
					<DialogDescription>Paste the JSON from &ldquo;Copy JSON&rdquo; in someone&apos;s Lab. Share links open by themselves: just visit them.</DialogDescription>
				</DialogHeader>
				<Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder='{"pitwall":1,"name":…}' className="h-40 font-mono text-xs" />
				<DialogFooter>
					<Button
						disabled={!text.trim()}
						onClick={async () => {
							try {
								const u = await importUniverse(text);
								toast.success(`Imported “${u.name}”`);
								setOpen(false);
								setText("");
								onImported(u);
							} catch (e) {
								toast.error((e as Error).message);
							}
						}}
					>
						Import
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

export function Lab() {
	const { base, error } = useBaseDb();
	const universes = useUniverses();
	const router = useRouter();
	const params = useSearchParams();
	const selectedId = params.get("u");
	const initialRaceId = params.get("race") ? Number(params.get("race")) : undefined;
	const [tab, setTab] = useState<string>("race-sim");

	const selected = universes?.find((u) => u.id === selectedId) ?? null;
	const select = useCallback((id: string | null) => router.replace(id ? `/lab?u=${id}` : "/lab", { scroll: false }), [router]);

	// Default to the most recent universe so the editors have somewhere to add changes.
	useEffect(() => {
		if (universes && !selectedId && universes.length) {
			const q = new URLSearchParams(params);
			q.set("u", (universes.find((u) => !u.shared) ?? universes[0]).id);
			router.replace(`/lab?${q}`, { scroll: false });
		}
	}, [universes, selectedId, params, router]);

	const applied = useAppliedUniverse(base, selected ? `${selected.id}@${selected.updatedAt}` : null, selected?.changes ?? null, { channel: "lab" });
	// while a universe is (re)building, editors compare against the last result (or reality)
	const current = (selected && applied.db) || base;
	const building = !!selected && (applied.pending || !applied.db);
	const impact = useMemo(() => (base && applied.db && selected ? championChanges(base, applied.db) : []), [base, applied.db, selected]);

	// editing a universe someone shared makes it yours
	const edit = (u: StoredUniverse, patch: Partial<Universe>) => {
		const { shared, ...own } = u;
		if (shared) toast.info("Saved to your Lab", { description: "Editing a shared universe keeps it." });
		return saveUniverse({ ...own, ...patch });
	};
	const addChange = async (change: Change) => {
		const u = selected ?? (await createUniverse("Untitled universe"));
		await edit(u, { changes: [...u.changes, change] });
		if (!selected) select(u.id);
		toast.success("Added to universe", { description: base ? describeChange(base, change).title : undefined });
	};
	const removeChange = (id: string) => selected && edit(selected, { changes: selected.changes.filter((c) => c.id !== id) });
	const own = universes?.filter((u) => !u.shared) ?? [];
	const shared = universes?.filter((u) => u.shared) ?? [];
	const universeButton = (u: StoredUniverse) => (
		<button
			key={u.id}
			onClick={() => select(u.id)}
			className={cn(
				"hover:bg-muted flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors",
				u.id === selectedId && "bg-background ring-foreground/10 shadow-sm ring-1",
			)}
		>
			<Orbit className={cn("size-4 shrink-0", u.id === selectedId ? "text-universe" : "text-muted-foreground")} />
			<div className="min-w-0 flex-1">
				<div className="truncate text-sm font-medium">{u.name}</div>
				<div className="text-muted-foreground text-xs">
					{u.changes.length} change{u.changes.length === 1 ? "" : "s"}
				</div>
			</div>
		</button>
	);
	const newUniverse = async (name = "Untitled universe", changes: Change[] = []) => select((await createUniverse(name, changes)).id);

	if (error)
		return (
			<Empty className="min-h-[60vh]">
				<EmptyHeader>
					<EmptyTitle>Couldn&apos;t load the dataset</EmptyTitle>
					<EmptyDescription>{error}</EmptyDescription>
				</EmptyHeader>
			</Empty>
		);
	if (!base || !current || !universes)
		return (
			<Empty className="min-h-[60vh]">
				<EmptyHeader>
					<EmptyMedia variant="icon">
						<Spinner />
					</EmptyMedia>
					<EmptyTitle>Loading 75 years of results</EmptyTitle>
				</EmptyHeader>
			</Empty>
		);

	return (
		<UniverseProvider universe={selected ? { id: selected.id, name: selected.name } : null}>
		<div className="grid grid-cols-1 min-h-[calc(100dvh-3.5rem)] lg:grid-cols-[300px_minmax(0,1fr)]">
			<aside id="universes" className="bg-muted/30 space-y-6 border-t p-4 max-lg:order-last lg:border-t-0 lg:border-r">
				<div className="space-y-2">
					<div className="flex items-center justify-between">
						<h2 className="text-sm font-medium">Your universes</h2>
						<Button size="sm" variant="outline" onClick={() => newUniverse()}>
							<Plus data-icon="inline-start" />
							New
						</Button>
					</div>
					{own.length === 0 ? (
						<p className="text-muted-foreground text-sm">None yet. Start from an idea below, or add a change.</p>
					) : (
						<div className="space-y-1">{own.map(universeButton)}</div>
					)}
				</div>
				{shared.length > 0 && (
					<div className="space-y-2">
						<h2 className="flex items-center gap-1.5 text-sm font-medium">
							<Inbox className="text-muted-foreground size-4" /> Shared with you
						</h2>
						<div className="space-y-1">{shared.map(universeButton)}</div>
					</div>
				)}
				<Separator />
				<div className="space-y-2">
					<h2 className="flex items-center gap-1.5 text-sm font-medium">
						<Lightbulb className="text-muted-foreground size-4" /> Start from an idea
					</h2>
					{PRESETS.map((p) => (
						<button key={p.name} onClick={() => newUniverse(p.name, p.changes)} className="hover:bg-muted group flex w-full items-start gap-2 rounded-lg px-3 py-2 text-left">
							<div className="min-w-0 flex-1">
								<div className="text-sm font-medium">{p.name}</div>
								<div className="text-muted-foreground text-xs">{p.description}</div>
							</div>
							<ChevronRight className="text-muted-foreground mt-0.5 size-4 opacity-0 transition-opacity group-hover:opacity-100" />
						</button>
					))}
				</div>
				<Separator />
				<ImportDialog onImported={(u) => select(u.id)} />
			</aside>

			<main className="min-w-0 space-y-10 px-4 py-6 sm:px-6 sm:py-8 lg:px-10">
				<header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
					<div className="min-w-0 flex-1 space-y-1.5">
						<div className="text-universe flex items-center gap-1.5 text-sm">
							<FlaskConical className="size-4" /> The Lab
							<a href="#universes" className="text-muted-foreground hover:text-foreground ml-auto inline-flex items-center gap-1 lg:hidden">
								<Orbit className="size-4" /> Your universes ({universes.length})
							</a>
						</div>
						{selected ? (
							<Input
								key={selected.id}
								aria-label="Universe name"
								defaultValue={selected.name}
								onBlur={(e) => {
									const v = e.target.value.trim();
									if (v && v !== selected.name) edit(selected, { name: v });
								}}
								className="h-auto max-w-2xl border-transparent bg-transparent px-0 py-0 text-2xl font-semibold tracking-tight shadow-none hover:bg-input/30 focus-visible:px-2 sm:text-3xl md:text-3xl"
							/>
						) : (
							<h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Rewrite Formula 1 history</h1>
						)}
						{selected?.shared && (
							<p className="border-universe/25 bg-universe/8 text-universe flex max-w-3xl items-start gap-2 rounded-lg border px-3 py-2 text-sm">
								<Inbox className="mt-0.5 size-4 shrink-0" />
								<span>Someone shared this universe with you. Save it to keep it with your own, or edit it to make it yours.</span>
							</p>
						)}
						<p className="text-muted-foreground max-w-3xl text-sm">
							Re-run races or whole eras, simulate careers into the future, tune drivers and cars, swap seats, change results or points systems, then browse seasons, careers and records as if it really happened.
						</p>
					</div>
					{selected && (
						<div className="flex flex-wrap gap-2">
							{selected.shared && (
								<Button
									variant="outline"
									onClick={async () => {
										await keepShared(selected);
										toast.success("Saved to your Lab");
									}}
								>
									<BookmarkPlus data-icon="inline-start" />
									Save<span className="max-sm:hidden"> to my Lab</span>
								</Button>
							)}
							<ShareButton universe={selected} variant="outline" />
							<Button
								variant="outline"
								onClick={() => {
									navigator.clipboard.writeText(exportUniverse(selected));
									toast.success("Universe copied as JSON");
								}}
								aria-label="Copy JSON"
								className="max-[379px]:px-2.5"
							>
								<Copy data-icon="inline-start" />
								<span className="max-[379px]:hidden">Copy JSON</span>
							</Button>
							<AlertDialog>
								<AlertDialogTrigger asChild>
									<Button variant="outline" size="icon" aria-label="Delete universe">
										<Trash2 />
									</Button>
								</AlertDialogTrigger>
								<AlertDialogContent>
									<AlertDialogHeader>
										<AlertDialogTitle>Delete &ldquo;{selected.name}&rdquo;?</AlertDialogTitle>
										<AlertDialogDescription>
											This removes the universe and its {selected.changes.length} changes from this browser. Share links you have sent keep working.
										</AlertDialogDescription>
									</AlertDialogHeader>
									<AlertDialogFooter>
										<AlertDialogCancel>Cancel</AlertDialogCancel>
										<AlertDialogAction variant="destructive" onClick={() => deleteUniverse(selected.id).then(() => select(null))}>
											Delete
										</AlertDialogAction>
									</AlertDialogFooter>
								</AlertDialogContent>
							</AlertDialog>
							<Link href={`/u/${selected.id}`} className={cn(buttonVariants({ className: "bg-universe hover:bg-universe/90 text-white max-sm:w-full" }))}>
								Explore this universe
								<ArrowRight data-icon="inline-end" />
							</Link>
						</div>
					)}
				</header>

				{selected && (
					<div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
						<Card className="gap-3 pb-2">
							<CardHeader>
								<CardTitle>Changes</CardTitle>
								<CardDescription>Applied in order, on top of real history.</CardDescription>
							</CardHeader>
							<CardContent className="px-2">
								{selected.changes.length === 0 ? (
									<p className="text-muted-foreground px-3 pb-3 text-sm">No changes yet, so this universe is still reality.</p>
								) : (
									<ol>
										{selected.changes.map((c, i) => {
											const d = describeChange(base, c);
											return (
												<li key={c.id} className="hover:bg-muted/50 flex items-center gap-3 rounded-lg px-3 py-2">
													<Badge variant="secondary" className="tabular-nums">
														{i + 1}
													</Badge>
													<div className="min-w-0 flex-1">
														<div className="truncate text-sm font-medium">{d.title}</div>
														<div className="text-muted-foreground text-xs">{d.detail}</div>
													</div>
													<Button variant="ghost" size="icon-sm" onClick={() => removeChange(c.id)} aria-label="Remove change">
														<Trash2 />
													</Button>
												</li>
											);
										})}
									</ol>
								)}
							</CardContent>
						</Card>
						<Card className="gap-3 pb-2">
							<CardHeader>
								<CardTitle className="max-sm:col-[1/-1]">Impact on the championships</CardTitle>
								<CardAction className="max-sm:col-[1/-1] max-sm:row-[3] max-sm:-ml-2.5 max-sm:justify-self-start">
									<Link href={`/u/${selected.id}/changes`} className={cn(buttonVariants({ variant: "ghost", size: "sm", className: "text-muted-foreground" }))}>
										<GitCompareArrows data-icon="inline-start" />
										What changed
									</Link>
								</CardAction>
								<CardDescription className="max-sm:col-[1/-1]">
									{applied.db?.modifiedYears?.size ?? 0} season{applied.db?.modifiedYears?.size === 1 ? "" : "s"} altered
									{impact.length > 0 && `, ${impact.length} with a different champion`}
								</CardDescription>
							</CardHeader>
							<CardContent className="px-2">
								{building ? (
									<p className="text-muted-foreground flex items-center gap-2 px-3 pb-3 text-sm">
										<Spinner />
										{applied.progress ? `Simulating ${applied.progress.year} · ${Math.round((100 * applied.progress.done) / applied.progress.total)}%` : "Applying changes"}
									</p>
								) : applied.error ? (
									<p className="text-destructive px-3 pb-3 text-sm">{applied.error}</p>
								) : impact.length === 0 ? (
									<p className="text-muted-foreground px-3 pb-3 text-sm">No titles have changed hands.</p>
								) : (
									<ScrollArea viewportClassName="sm:max-h-72">
										<Table className="[&_td:first-child]:pl-3 [&_td:last-child]:pr-3">
											<TableBody>
												{impact.map((c) => (
													<TableRow key={c.year}>
														<TableCell className="w-14 font-semibold">
															<SeasonLink year={c.year} />
														</TableCell>
														<TableCell>
															{c.real !== c.now ? (
																<span className="inline-flex flex-wrap items-center gap-1.5 max-sm:flex-col max-sm:items-start max-sm:gap-0">
																	{c.real ? (
																		<span className="text-muted-foreground line-through">
																			<DriverLink driver={driverRef(base, c.real)} flag={false} className="max-sm:hidden" />
																			<DriverLink driver={shortRef(driverRef(base, c.real))} flag={false} className="sm:hidden" />
																		</span>
																	) : (
																		<span className="text-muted-foreground text-xs">{c.year > base.meta.lastCompletedYear ? "New season" : "No champion"}</span>
																	)}
																	<ArrowRight className="text-muted-foreground size-3.5 max-sm:hidden" />
																	{c.now ? (
																		<DriverLink driver={driverRef(applied.db!, c.now)} className="text-universe font-medium" />
																	) : (
																		<span className="text-muted-foreground text-xs">In progress</span>
																	)}
																</span>
															) : (
																<span className="text-muted-foreground block">Drivers&apos; title unchanged</span>
															)}
															{c.realTeam !== c.nowTeam && (c.realTeam || c.nowTeam) && (
																<div className="text-muted-foreground mt-0.5 inline-flex flex-wrap items-center gap-1.5 text-xs">
																	<span className="sm:hidden">Teams:</span>
																	<span className="max-sm:hidden">Constructors:</span>
																	<span className="inline-flex items-center gap-1.5 whitespace-nowrap [&_*]:whitespace-nowrap">
																		{c.realTeam && (
																			<span className="line-through">
																				<TeamLink team={teamRef(base, c.realTeam)} />
																			</span>
																		)}
																		<ArrowRight className="size-3" />
																		{c.nowTeam && <TeamLink team={teamRef(applied.db!, c.nowTeam)} className="text-universe" />}
																	</span>
																</div>
															)}
														</TableCell>
														<TableCell className="w-8">
															<Link
																href={`/u/${selected.id}/seasons/${c.year}`}
																aria-label={`${c.year} season in this universe`}
																className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }))}
															>
																<ChevronRight />
															</Link>
														</TableCell>
													</TableRow>
												))}
											</TableBody>
										</Table>
									</ScrollArea>
								)}
							</CardContent>
						</Card>
					</div>
				)}

				<section className="space-y-4">
					<div className="space-y-0.5">
						<h2 className="flex items-center gap-2 text-xl font-semibold leading-8">
							<Sparkles className="text-universe size-5" /> Add a change
						</h2>
						<p className="text-muted-foreground text-sm">Every change previews its effect before you add it.</p>
					</div>
					<Tabs value={tab} onValueChange={(v) => setTab(String(v))} className="gap-6">
						<Select items={EDITORS.map((e) => ({ value: e.id, label: e.label }))} value={tab} onValueChange={(v) => setTab(String(v))}>
							<SelectTrigger className="w-full sm:hidden" aria-label="Kind of change">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{EDITORS.map((e) => (
									<SelectItem key={e.id} value={e.id}>
										{e.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						<TabsList variant="line" className="h-auto flex-wrap justify-start gap-y-1 group-data-horizontal/tabs:h-auto max-sm:hidden">
							{EDITORS.map((e) => (
								<TabsTrigger key={e.id} value={e.id} className="h-8 flex-none px-2.5">
									{e.label}
								</TabsTrigger>
							))}
						</TabsList>
						{EDITORS.map(({ id, Editor }) => (
							<TabsContent key={id} value={id}>
								<Editor key={selected?.id} base={base} current={current} changes={selected?.changes ?? []} onAdd={addChange} initialRaceId={initialRaceId} />
							</TabsContent>
						))}
					</Tabs>
				</section>
			</main>
		</div>
		</UniverseProvider>
	);
}
