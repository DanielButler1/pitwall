import type { Metadata } from "next";
import { ChevronRight, History, UserSearch } from "lucide-react";
import { Page, PageHeader } from "@/components/f1";
import { ULink } from "@/components/universe-link";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "Play", description: "Formula 1 games built on seventy-odd years of results." };

const GAMES = [
	{
		href: "/play/guess",
		icon: UserSearch,
		title: "Guess the driver",
		description: "A new mystery driver every day. Eight guesses, with clues from nationality, career span, teams, starts, wins and titles.",
		tag: "Daily",
	},
	{
		href: "/play/fantasy",
		icon: History,
		title: "Fantasy: Through the Eras",
		description: "Build a team from drivers and constructors across Formula 1 history and see how it scores.",
		tag: "Fantasy",
	},
];

export default function PlayPage() {
	return (
		<Page>
			<PageHeader title="Play">Games built on every Formula 1 season since 1950.</PageHeader>
			<div className="grid gap-4 sm:grid-cols-2">
				{GAMES.map((g) => (
					<ULink key={g.href} href={g.href} className="group focus-visible:ring-ring/30 rounded-[min(var(--radius-4xl),24px)] outline-none focus-visible:ring-3">
						<Card className="group-hover:ring-foreground/20 h-full transition-shadow">
							<CardHeader className="gap-3">
								<div className="flex items-center justify-between">
									<span className="bg-primary/10 text-primary inline-flex size-10 items-center justify-center rounded-xl">
										<g.icon className="size-5" />
									</span>
									<span className="text-muted-foreground text-xs font-medium">{g.tag}</span>
								</div>
								<CardTitle className="flex items-center gap-1 text-lg">
									{g.title}
									<ChevronRight className="text-muted-foreground size-4 transition-transform group-hover:translate-x-0.5" />
								</CardTitle>
								<CardDescription>{g.description}</CardDescription>
							</CardHeader>
						</Card>
					</ULink>
				))}
			</div>
		</Page>
	);
}
