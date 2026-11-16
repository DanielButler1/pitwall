// /ai: how to connect an AI assistant to Pitwall's MCP server (src/app/mcp).

import {
	CalendarDays, Database, Flag, GitCompareArrows, Gauge, ListOrdered, Lock, Medal, Search, ShieldCheck, Sparkles, Timer, Trophy, User, Users, Zap,
} from "lucide-react";
import Link from "next/link";
import { Page, PageHeader, Section, StatCard, num } from "../f1";
import { Badge } from "../ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { CodeLine, ExampleQuestion } from "./ai-copy";

export type AiView = {
	endpoint: string;
	firstYear: number;
	lastYear: number;
	races: number;
	drivers: number;
	records: number;
	f1dbRelease: string | null;
	jolpica: { dumpDate: string | null; lapsFrom: number; pitStopsFrom: number | null } | null;
};

const QUESTIONS: { text: string; icon: React.ReactNode }[] = [
	{ text: "Who has won the Monaco Grand Prix from furthest down the grid?", icon: <Trophy /> },
	{ text: "How did Hamilton and Alonso compare as team-mates in 2007, race by race?", icon: <Users /> },
	{ text: "Who would have won the 2008 title under today's points system?", icon: <ListOrdered /> },
	{ text: "Which drivers have led the most laps without ever winning a race?", icon: <Timer /> },
	{ text: "Which drivers have collected the most 5-second penalties since 2019?", icon: <Flag /> },
	{ text: "Who are the youngest Grand Prix winners, and how old were they?", icon: <Medal /> },
	{ text: "What happened in Formula 1 on my birthday?", icon: <CalendarDays /> },
	{ text: "Which milestones could the current grid reach before the season ends?", icon: <Gauge /> },
];

const TOOLS: { icon: React.ReactNode; title: string; detail: string }[] = [
	{ icon: <Search />, title: "Search", detail: "Find any driver, team, circuit, Grand Prix, engine, tyre maker, nation or season by name." },
	{ icon: <Trophy />, title: "Seasons and races", detail: "Results, qualifying, sprints, standings, laps led, pit stops, weather and safety cars." },
	{ icon: <User />, title: "Careers", detail: "Drivers, constructors, engines and tyres: totals, titles and season-by-season records." },
	{ icon: <Medal />, title: "Records", detail: "Around 580 record categories, from most wins to the longest streaks." },
	{ icon: <GitCompareArrows />, title: "Comparisons", detail: "Up to four careers side by side, and team-mate head-to-heads." },
	{ icon: <ListOrdered />, title: "What-ifs", detail: "Any season re-scored under another points system, and today's milestone chases." },
	{ icon: <Database />, title: "SQL", detail: "Read-only queries over the whole dataset, for questions no page answers." },
];

function Steps({ children }: { children: React.ReactNode }) {
	return <ol className="marker:text-muted-foreground list-decimal space-y-2 pl-5 [&>li]:pl-1">{children}</ol>;
}

function Setup({ endpoint }: { endpoint: string }) {
	const clients: { id: string; label: string; body: React.ReactNode }[] = [
		{
			id: "chatgpt",
			label: "ChatGPT",
			body: (
				<Steps>
					<li>
						On chatgpt.com, open <strong>Plugins</strong> and choose <strong>Add custom MCP server</strong>. On older versions, it's under <strong>Settings → Apps &amp; Connectors</strong>, with <strong>Developer mode</strong> turned on.
					</li>
					<li>
						Name it <strong>Pitwall</strong>, paste the server address, and choose <strong>No authentication</strong>.
					</li>
					<li>In a new chat, turn Pitwall on from the + menu and ask away.</li>
				</Steps>
			),
		},
		{
			id: "claude",
			label: "Claude",
			body: (
				<Steps>
					<li>
						On claude.ai or in the Claude app, go to <strong>Customize → Connectors</strong>.
					</li>
					<li>
						Select <strong>Add</strong>, then <strong>Add custom connector</strong>. Name it <strong>Pitwall</strong>, paste the server address and click{" "}
						<strong>Continue</strong>, then <strong>Add</strong>. No sign-in is needed.
					</li>
					<li>In a chat, check Pitwall is on under + → Connectors.</li>
				</Steps>
			),
		},
		{
			id: "claude-code",
			label: "Claude Code",
			body: (
				<div className="space-y-3">
					<p>Run this once in a terminal, then ask Claude Code about F1:</p>
					<CodeLine code={`claude mcp add --transport http pitwall ${endpoint}`} what="Command" />
				</div>
			),
		},
		{
			id: "cursor",
			label: "Cursor",
			body: (
				<div className="space-y-3">
					<p>
						Add this to <code className="font-mono text-[13px]">~/.cursor/mcp.json</code> (or the project's <code className="font-mono text-[13px]">.cursor/mcp.json</code>):
					</p>
					<CodeLine code={JSON.stringify({ mcpServers: { pitwall: { url: endpoint } } }, null, 2)} what="Config" />
				</div>
			),
		},
		{
			id: "vscode",
			label: "VS Code",
			body: (
				<div className="space-y-3">
					<p>
						Add this to <code className="font-mono text-[13px]">.vscode/mcp.json</code>, then start the server from the file and use it in Copilot Chat's agent mode:
					</p>
					<CodeLine code={JSON.stringify({ servers: { pitwall: { type: "http", url: endpoint } } }, null, 2)} what="Config" />
				</div>
			),
		},
		{
			id: "other",
			label: "Other",
			body: (
				<p>
					Any app that supports remote MCP servers can connect. Use the address above with the <strong>Streamable HTTP</strong> transport and no authentication.
				</p>
			),
		},
	];
	return (
		<Tabs defaultValue="chatgpt" className="gap-4">
			{/* one row that scrolls sideways on phones, rather than wrapping out of its bar */}
			<TabsList className="max-w-full justify-start overflow-x-auto [scrollbar-width:none]">
				{clients.map((c) => (
					<TabsTrigger key={c.id} value={c.id} className="flex-none px-2.5">
						{c.label}
					</TabsTrigger>
				))}
			</TabsList>
			{clients.map((c) => (
				<TabsContent key={c.id} value={c.id}>
					<Card>
						<CardContent className="max-w-3xl space-y-3 leading-relaxed">{c.body}</CardContent>
					</Card>
				</TabsContent>
			))}
		</Tabs>
	);
}

export function AiPage({ view }: { view: AiView }) {
	return (
		<Page>
			<PageHeader
				eyebrow={
					<span className="inline-flex items-center gap-1.5">
						<Sparkles className="size-4" /> Pitwall for AI
					</span>
				}
				title="Ask your AI assistant about Formula 1"
			>
				Connect ChatGPT, Claude or any AI assistant that supports MCP to Pitwall. It can then answer F1 questions from the same data as this site,
				anything from a single race result to a niche stat, and link back to the pages it used.
			</PageHeader>

			<Card className="border-f1/30 ring-f1/20">
				<CardHeader>
					<CardTitle className="flex flex-wrap items-center gap-2">
						<span className="bg-f1 inline-block h-4 w-1 -skew-x-12 rounded-sm" />
						Server address
					</CardTitle>
					<CardDescription>Paste this wherever your assistant asks for an MCP server or connector URL.</CardDescription>
				</CardHeader>
				<CardContent className="space-y-3">
					<CodeLine code={view.endpoint} what="Address" />
					<div className="flex flex-wrap gap-2">
						<Badge variant="secondary">
							<Zap /> Free and public
						</Badge>
						<Badge variant="secondary">
							<Lock /> No sign-in
						</Badge>
						<Badge variant="secondary">
							<ShieldCheck /> Read-only
						</Badge>
					</div>
				</CardContent>
			</Card>

			<Section title="Connect it" description="Pick your assistant. The steps take a minute, and you only do them once.">
				<Setup endpoint={view.endpoint} />
			</Section>

			<Section title="Try asking" description="Click a question to copy it. Your assistant will make as many lookups as a question needs.">
				<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
					{QUESTIONS.map((q) => (
						<ExampleQuestion key={q.text} text={q.text} icon={q.icon} />
					))}
				</div>
			</Section>

			<Section title="What it can reach" description="Every page on Pitwall, plus direct access to the data behind them.">
				<div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
					<StatCard label="Seasons" value={`${view.firstYear}–${view.lastYear}`} />
					<StatCard label="Grands Prix" value={num(view.races)} />
					<StatCard label="Drivers" value={num(view.drivers)} />
					<StatCard label="Record categories" value={num(view.records)} />
				</div>
				<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
					{TOOLS.map((t) => (
						<Card key={t.title} size="sm" className="h-full">
							<CardHeader>
								<CardTitle className="flex items-center gap-2 [&_svg]:text-muted-foreground [&_svg]:size-4">
									{t.icon}
									{t.title}
								</CardTitle>
								<CardDescription>{t.detail}</CardDescription>
							</CardHeader>
						</Card>
					))}
				</div>
			</Section>

			<Section title="Good to know">
				<Card>
					<CardContent className="text-muted-foreground max-w-3xl space-y-3 leading-relaxed">
						<p>
							The data updates after every Grand Prix. Lap charts, laps led and pit stops start in {view.jolpica?.lapsFrom ?? 1996} and run about two weeks behind.
							Stewards' decisions start in 2019.
						</p>
						<p>
							The figures come from Pitwall, but the AI writes the answer. For anything important, follow the links it gives to the Pitwall pages it used.
						</p>
						<p>
							Pitwall only receives the lookups your assistant makes, never your conversation, and keeps nothing beyond standard hosting logs. See the{" "}
							<Link className="text-foreground underline" href="/privacy">
								privacy policy
							</Link>{" "}
							and{" "}
							<Link className="text-foreground underline" href="/terms">
								terms
							</Link>
							.
						</p>
						<p>
							Data: <a className="text-foreground underline" href="https://github.com/f1db/f1db">F1DB</a>
							{view.f1dbRelease && ` ${view.f1dbRelease}`} (CC BY 4.0)
							{view.jolpica && (
								<>
									; lap charts, laps led and pit stops: <a className="text-foreground underline" href="https://github.com/jolpica/jolpica-f1">Jolpica F1</a> (free
									non-commercial data dump{view.jolpica.dumpDate && ` of ${view.jolpica.dumpDate}`})
								</>
							)}
							. Your assistant is asked to credit both whenever it uses them.
						</p>
					</CardContent>
				</Card>
			</Section>
		</Page>
	);
}
