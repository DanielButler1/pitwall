// "Grid of nine" (/play/grid): the website's components/play/grid.tsx for the phone. Tapping a
// cell opens the picker for it in a sheet; after the game every cell's answers are listed, with
// the full list behind "See all N".

import { Check, Dices, Flag as FlagIcon, List, Users, X } from "lucide-react-native";
import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { cellCategories, categoryHint, CELLS, driverWeight, MAX_GUESSES, puzzleNumber, rarity, shareText, type Category, type Grid, type GridData, type GridDriver, type Board } from "@pitwall/core/game/grid";
import { Flag, Stat, StatGrid } from "@/components/f1";
import { Button, Icon, Section, Text } from "@/components/ui";
import { cn } from "@/lib/cn";
import { webUrl } from "@/lib/config";
import { haptic } from "@/lib/haptics";
import { href, useOpen } from "@/lib/links";
import { EntityPicker, Figures, GameError, GameHeader, GameLoading, GameScreen, LegendItem, ResultCard, shareResult, StatsPanel, useDbData, useToday, VERDICT_STYLE } from "@/features/play/kit";
import { gridLoader } from "../data";
import { NameLink, Sheet } from "../parts";
import { BoardView, CategoryIcon } from "./Board";
import { useGrid } from "./useGrid";

const span = (d: GridDriver) => (d.first === d.last ? String(d.first) : `${d.first}–${d.last}`);

export function GridScreen() {
	const { data, error, retry } = useDbData(gridLoader);
	const { today, rollover } = useToday();
	const [statsOpen, setStatsOpen] = useState(false);
	const game = data ? <GridGame key={today} data={data} today={today} rollover={rollover} statsOpen={statsOpen} setStatsOpen={setStatsOpen} /> : null;
	return game ?? (
		<GameScreen title="Grid of nine" today={today} mode="daily">
			{error ? <GameError what="the grid" onRetry={retry} /> : <GameLoading />}
		</GameScreen>
	);
}

function GridGame({ data, today, rollover, statsOpen, setStatsOpen }: { data: GridData; today: number; rollover: () => void; statsOpen: boolean; setStatsOpen: (o: boolean) => void }) {
	const g = useGrid(data, today);
	const [picking, setPicking] = useState<number | null>(null);
	const [flash, setFlash] = useState<{ cell: number; n: number } | null>(null);
	const [note, setNote] = useState<string | null>(null);
	const [hint, setHint] = useState<Category | null>(null);
	const items = useMemo(() => data.drivers.map((d) => ({ id: d.id, label: d.name, sublabel: span(d), weight: driverWeight(d), driver: d })), [data]);

	const { grid, answers, board, over, mode } = g;
	const counts = useMemo(() => answers?.map((a) => a.length) ?? [], [answers]);

	const pick = (cell: number, d: GridDriver) => {
		setPicking(null);
		if (!grid || !board) return;
		const ok = g.guess(cell, d);
		if (ok == null) return;
		if (ok) {
			haptic("success");
			setNote(null);
		} else {
			haptic("error");
			const [r, c] = cellCategories(grid, cell).map((i) => data.categories[i].label);
			const left = board.left - 1;
			setNote(`${d.name} doesn't fit ${r} × ${c}. ${left === 1 ? "1 guess" : `${left} guesses`} left.`);
			setFlash((f) => ({ cell, n: (f?.n ?? 0) + 1 }));
		}
	};

	const share = () => {
		if (!board) return;
		void shareResult(shareText({ board, label: mode === "daily" ? `#${puzzleNumber(today)}` : "practice", url: webUrl("/play/grid") }));
	};

	const ready = grid && answers && board;
	return (
		<GameScreen title="Grid of nine" today={today} mode={mode} onStats={() => setStatsOpen(true)}>
			<GameHeader mode={mode} onModeChange={(m) => { g.setMode(m); setNote(null); }}>
				<Text variant="muted">
					A new board every day at midnight UTC, the same for everyone. Each cell needs a driver who fits both its row and its column: a team, a nationality,
					a decade or a feat. You have {MAX_GUESSES} guesses, and each driver can only be used once. Tap a row or column heading to see exactly what it asks for.
				</Text>
			</GameHeader>

			{!ready ? (
				<GameLoading />
			) : (
				<>
					{over ? (
						<ResultCard
							won={board.filled === CELLS}
							status={board.filled === CELLS ? "Perfect grid! All nine filled." : `${board.filled} of ${CELLS} cells filled.`}
							mode={mode}
							nextLabel={mode === "practice" ? "Next practice grid" : "Practice with a random grid"}
							countdownLabel="Next grid in"
							onShare={share}
							onStats={() => setStatsOpen(true)}
							onNext={() => {
								g.newPractice();
								setNote(null);
							}}
							onRollover={rollover}
						>
							<Figures
								items={[
									["Cells filled", board.filled],
									["Rarity score", board.rarity],
									...(mode === "daily" && g.best != null ? ([["Best rarity", g.best]] as [string, number][]) : []),
								]}
							/>
							<Text variant="muted">Every cell&apos;s answers are below: the best-known and the least-known driver who fit, and the full list behind “See all”.</Text>
						</ResultCard>
					) : null}

					<View className="mt-4">
						<BoardView data={data} grid={grid} board={board} answerCounts={counts} over={over} flash={flash} onPick={setPicking} onHint={(c) => setHint((h) => (h?.id === c.id ? null : c))} />
					</View>
					{hint ? <HintLine cat={hint} onClose={() => setHint(null)} /> : null}
					{note && !over ? (
						<Text variant="small" className="mx-4 mt-3 text-destructive" accessibilityLiveRegion="polite">
							{note}
						</Text>
					) : null}

					{!over ? (
						<>
							<StatGrid className="mt-4">
								<Stat label="Filled" value={`${board.filled}/${CELLS}`} />
								<Stat label="Rarity" value={board.rarity} />
							</StatGrid>
							<Controls mode={mode} onGiveUp={g.giveUp} onNewGrid={() => { g.newPractice(); setNote(null); }} />
						</>
					) : null}

					{board.misses.length > 0 ? <Misses data={data} grid={grid} board={board} /> : null}
					{over ? <Reveal data={data} grid={grid} board={board} answers={answers} /> : null}
					<Scoring />
				</>
			)}

			{ready && picking != null && !over ? (
				<Picker
					cats={cellCategories(grid, picking).map((i) => data.categories[i])}
					left={board.left}
					items={items}
					exclude={[...board.cells.flatMap((c) => (c ? [c.driver.id] : [])), ...board.misses.filter((m) => m.cell === picking).map((m) => m.driver.id)]}
					misses={board.misses.filter((m) => m.cell === picking).map((m) => m.driver)}
					onClose={() => setPicking(null)}
					onPick={(d) => pick(picking, d)}
				/>
			) : null}

			<StatsPanel
				open={statsOpen}
				onClose={() => setStatsOpen(false)}
				stats={g.stats}
				today={today}
				description={`Daily grids, saved on this phone. A win is a full grid.${g.best != null ? ` Best rarity score: ${g.best}.` : ""}`}
				distributionTitle="Cells filled"
				distributionLabel="Daily grids by cells filled"
				bucketLabel={(i) => String(i)}
				bucketSrLabel={(i) => `grids with ${i} filled`}
				highlight={mode === "daily" && over ? (board?.filled ?? null) : null}
			/>
		</GameScreen>
	);
}

function HintLine({ cat, onClose }: { cat: Category; onClose: () => void }) {
	return (
		<Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel={`${cat.label}: ${categoryHint(cat)}. Hide`} className="mx-4 mt-3 flex-row items-center gap-2 rounded-md bg-muted px-3 py-2.5">
			<CategoryIcon cat={cat} size={22} />
			<Text variant="small" className="flex-1">
				<Text variant="small" className="font-semibold">
					{cat.label}:{" "}
				</Text>
				{categoryHint(cat)}
			</Text>
		</Pressable>
	);
}

function Controls({ mode, onGiveUp, onNewGrid }: { mode: "daily" | "practice"; onGiveUp: () => void; onNewGrid: () => void }) {
	const [confirm, setConfirm] = useState(false);
	const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
	useEffect(() => () => clearTimeout(timer.current), []);
	return (
		<View className="mt-3 flex-row flex-wrap gap-2 px-4">
			{mode === "practice" ? <Button label="New grid" icon={Dices} variant="outline" size="sm" onPress={onNewGrid} /> : null}
			<Button
				label={confirm ? "Tap again to give up" : "Give up"}
				icon={FlagIcon}
				variant={confirm ? "destructive" : "ghost"}
				size="sm"
				onPress={() => {
					if (confirm) return onGiveUp();
					setConfirm(true);
					clearTimeout(timer.current);
					timer.current = setTimeout(() => setConfirm(false), 4000);
				}}
			/>
		</View>
	);
}

function Misses({ data, grid, board }: { data: GridData; grid: Grid; board: Board }) {
	return (
		<Section title="Wrong guesses">
			<View className="gap-2 px-4">
				{board.misses.map((m, i) => {
					const [r, c] = cellCategories(grid, m.cell).map((x) => data.categories[x].label);
					return (
						<View key={i} className="flex-row items-center gap-2">
							<Icon icon={X} tone="muted" size={14} />
							<Flag code={m.driver.flag} />
							<Text variant="small" className="font-semibold" numberOfLines={1}>
								{m.driver.name}
							</Text>
							<Text variant="caption" className="flex-1" numberOfLines={1}>
								{r} × {c}
							</Text>
						</View>
					);
				})}
			</View>
		</Section>
	);
}

function Scoring() {
	return (
		<Section title="How scoring works">
			<View className="gap-3 px-4">
				<Text variant="muted">
					Every right answer scores a rarity from 0 to 100 based on how well known the driver is among everyone who fits that cell (by race starts, plus five
					per win). The best-known answer scores 0 and the least-known scores 100. Your rarity score adds up all nine cells (900 at most), so higher means more
					obscure picks.
				</Text>
				<LegendItem verdict="match" icon={Check}>
					Filled (the number is its rarity)
				</LegendItem>
				<LegendItem verdict="miss" icon={X}>
					Not filled
				</LegendItem>
			</View>
		</Section>
	);
}

/* --------------------------------------------------------------- picker --- */

type Item = { id: string; label: string; sublabel: string; weight: number; driver: GridDriver };

function Picker({ cats, left, items, exclude, misses, onClose, onPick }: { cats: Category[]; left: number; items: Item[]; exclude: string[]; misses: GridDriver[]; onClose: () => void; onPick: (d: GridDriver) => void }) {
	const [a, b] = cats;
	return (
		<Sheet
			open
			onClose={onClose}
			title={
				<View className="flex-row flex-wrap items-center gap-x-2 gap-y-1">
					<View className="flex-row items-center gap-1.5">
						<CategoryIcon cat={a} size={22} />
						<Text variant="heading">{a.label}</Text>
					</View>
					<Text variant="heading" className="text-muted-foreground">
						×
					</Text>
					<View className="flex-row items-center gap-1.5">
						<CategoryIcon cat={b} size={22} />
						<Text variant="heading">{b.label}</Text>
					</View>
				</View>
			}
			subtitle={
				<View className="mt-1.5 gap-0.5">
					<Text variant="caption">• {categoryHint(a)}</Text>
					<Text variant="caption">• {categoryHint(b)}</Text>
				</View>
			}
		>
			<ScrollView keyboardShouldPersistTaps="handled" contentContainerClassName="pb-8">
				<View className="flex-row flex-wrap justify-between gap-x-3 gap-y-1 px-4 pb-2 pt-1">
					<Text variant="caption">{left === 1 ? "Last guess" : `${left} guesses left`} · a wrong pick uses one up</Text>
					{misses.length > 0 ? <Text variant="caption">Tried: {misses.map((d) => d.lastName).join(", ")}</Text> : null}
				</View>
				<EntityPicker items={items} exclude={exclude} onPick={(i) => onPick(i.driver)} label="Pick a driver for this cell" placeholder="Type a driver's name…" noun="drivers" />
				<View className="items-center gap-2 px-8 pt-8" importantForAccessibility="no-hide-descendants">
					<Icon icon={Users} tone="muted" size={20} />
					<Text variant="caption" className="text-center">
						Start typing a name: every driver who started a Grand Prix is in the list.
					</Text>
				</View>
			</ScrollView>
		</Sheet>
	);
}

/* --------------------------------------------------------------- reveal --- */

function Reveal({ data, grid, board, answers }: { data: GridData; grid: Grid; board: Board; answers: GridDriver[][] }) {
	const open = useOpen();
	const [all, setAll] = useState<number | null>(null);
	const catLink = (cat: Category) =>
		cat.kind === "team" ? () => open(href.team(cat.key)) : cat.kind === "nation" ? () => open(href.nation(cat.key)) : cat.kind === "mate" ? () => open(href.driver(cat.key)) : undefined;
	return (
		<Section title="Answers">
			{answers.map((list, i) => {
				const [r, c] = cellCategories(grid, i).map((x) => data.categories[x]);
				const mine = board.cells[i];
				return (
					<View key={i} className={cn("gap-2 px-4 py-3", i < CELLS - 1 && "border-b border-border")}>
						<View className="flex-row items-start gap-2">
							<View className="flex-1 flex-row flex-wrap items-center gap-x-1.5">
								<NameLink onPress={catLink(r)}>{r.label}</NameLink>
								<Text variant="label" className="text-muted-foreground">
									×
								</Text>
								<NameLink onPress={catLink(c)}>{c.label}</NameLink>
							</View>
							<Text variant="caption" className="tabular-nums">
								{list.length} answers
							</Text>
						</View>
						<AnswerLine label="Best known" d={list[0]} />
						<AnswerLine label="Least known" d={list[list.length - 1]} />
						<View className="flex-row items-center gap-2">
							<Text variant="caption" className="w-24">
								You
							</Text>
							{mine ? (
								<>
									<DriverName d={mine.driver} />
									<View className={cn("rounded-full px-1.5", VERDICT_STYLE.match.box)}>
										<Text className="text-[11px] font-semibold tabular-nums text-white">{mine.rarity}</Text>
									</View>
								</>
							) : (
								<Text variant="small" className="text-muted-foreground">
									Not filled
								</Text>
							)}
						</View>
						<View className="flex-row">
							<Button label={`See all ${list.length}`} icon={List} variant="outline" size="sm" accessibilityLabel={`See all ${list.length} answers for ${r.label} × ${c.label}`} onPress={() => setAll(i)} />
						</View>
					</View>
				);
			})}
			{all != null ? <AllAnswers data={data} grid={grid} cell={all} list={answers[all]} mine={board.cells[all]?.driver.id ?? null} onClose={() => setAll(null)} /> : null}
		</Section>
	);
}

function DriverName({ d }: { d: GridDriver }) {
	const open = useOpen();
	return (
		<View className="shrink flex-row items-center gap-1.5">
			<Flag code={d.flag} />
			<NameLink onPress={() => open(href.driver(d.id))}>{d.name}</NameLink>
		</View>
	);
}

function AnswerLine({ label, d }: { label: string; d: GridDriver }) {
	return (
		<View className="flex-row items-center gap-2">
			<Text variant="caption" className="w-24">
				{label}
			</Text>
			<DriverName d={d} />
		</View>
	);
}

/** Every valid answer for a cell, best known first, with the rarity each would have scored. */
function AllAnswers({ data, grid, cell, list, mine, onClose }: { data: GridData; grid: Grid; cell: number; list: GridDriver[]; mine: string | null; onClose: () => void }) {
	const [a, b] = cellCategories(grid, cell).map((x) => data.categories[x]);
	return (
		<Sheet
			open
			onClose={onClose}
			title={`${a.label} × ${b.label}`}
			subtitle={`All ${list.length} ${list.length === 1 ? "driver" : "drivers"} who fit, best known first. The number is the rarity that pick would have scored.`}
		>
			<ScrollView contentContainerClassName="pb-8">
				{list.map((d, rank) => {
					const you = d.id === mine;
					return (
						<View key={d.id} className={cn("min-h-12 flex-row items-center gap-3 px-4 py-2", you ? VERDICT_STYLE.match.box : "border-b border-border")}>
							<Text variant="caption" className={cn("w-7 text-right tabular-nums", you && "text-white")}>
								{rank + 1}
							</Text>
							<View className="flex-1">
								<View className="flex-row items-center gap-1.5">
									<Flag code={d.flag} />
									<DriverName2 d={d} you={you} onOpened={onClose} />
								</View>
								<Text variant="caption" className={cn("tabular-nums", you && "text-white")}>
									{span(d)} · {d.starts} {d.starts === 1 ? "start" : "starts"}
									{d.wins > 0 ? ` · ${d.wins} ${d.wins === 1 ? "win" : "wins"}` : ""}
									{you ? " · your pick" : ""}
								</Text>
							</View>
							<View className={cn("min-w-9 items-center rounded-full px-1.5 py-0.5", you ? "bg-black/20" : "bg-muted")}>
								<Text variant="caption" className={cn("font-semibold tabular-nums", you ? "text-white" : "text-foreground")}>
									{rarity(list, d)}
								</Text>
							</View>
						</View>
					);
				})}
			</ScrollView>
		</Sheet>
	);
}

function DriverName2({ d, you, onOpened }: { d: GridDriver; you: boolean; onOpened: () => void }) {
	const open = useOpen();
	return (
		<Pressable accessibilityRole="link" onPress={() => { onOpened(); open(href.driver(d.id)); }} hitSlop={6} className="shrink active:opacity-70">
			<Text variant="label" numberOfLines={1} className={you ? "text-white" : "text-link"}>
				{d.name}
			</Text>
		</Pressable>
	);
}
