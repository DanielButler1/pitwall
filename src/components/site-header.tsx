"use client";

import { Fragment } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { CalendarClock, ChevronDown, CircleDot, Cog, FlaskConical, Gamepad2, GitCompareArrows, Globe, ListOrdered, Moon, Sun, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button, buttonVariants } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SiteSearch } from "./site-search";

const NAV = [
	{ href: "/seasons", label: "Seasons" },
	{ href: "/drivers", label: "Drivers" },
	{ href: "/constructors", label: "Constructors" },
	{ href: "/circuits", label: "Circuits" },
	{ href: "/records", label: "Records" },
	{ href: "/diary", label: "Diary" },
];

const MORE_GROUPS = [
	{
		label: "Browse",
		items: [
			{ href: "/grands-prix", label: "Grands Prix", icon: Trophy },
			{ href: "/engines", label: "Engines", icon: Cog },
			{ href: "/tyres", label: "Tyres", icon: CircleDot },
			{ href: "/nations", label: "Nations", icon: Globe },
		],
	},
	{
		label: "Tools",
		items: [
			{ href: "/compare", label: "Compare", icon: GitCompareArrows },
			{ href: "/points", label: "Points systems", icon: ListOrdered },
			{ href: "/milestones", label: "Milestones", icon: CalendarClock },
		],
	},
];
const MORE = MORE_GROUPS.flatMap((g) => g.items);

const navItem = "text-muted-foreground hover:text-foreground rounded-md px-2.5 py-1.5 whitespace-nowrap transition-colors";

export function SiteHeader() {
	const pathname = usePathname();
	const { resolvedTheme, setTheme } = useTheme();
	// Inside a universe, nav stays inside it.
	const universe = pathname.match(/^\/u\/([^/]+)/)?.[1];
	const prefix = universe ? `/u/${universe}` : "";
	const path = universe ? pathname.slice(prefix.length) || "/" : pathname;
	const moreActive = MORE.some((m) => path.startsWith(m.href));

	return (
		<header className="bg-background/85 sticky top-0 z-40 border-b backdrop-blur">
			<div className="flex h-14 w-full items-center gap-6 px-4 sm:px-6 lg:px-10">
				<Link href={prefix || "/"} className="flex items-center gap-2 font-semibold tracking-tight">
					<span className="bg-f1 inline-block h-5 w-1.5 -skew-x-12 rounded-sm" />
					Pitwall
				</Link>
				<nav className="flex min-w-0 items-center gap-1 overflow-x-auto text-sm">
					{NAV.map((item) => (
						<Link key={item.href} href={prefix + item.href} className={cn(navItem, path.startsWith(item.href) && "text-foreground bg-muted")}>
							{item.label}
						</Link>
					))}
					<DropdownMenu>
						<DropdownMenuTrigger className={cn(navItem, "inline-flex items-center gap-1 outline-none", moreActive && "text-foreground bg-muted")}>
							{MORE.find((m) => path.startsWith(m.href))?.label ?? "More"}
							<ChevronDown className="size-3.5" />
						</DropdownMenuTrigger>
						<DropdownMenuContent align="start" className="w-48">
							{MORE_GROUPS.map((group, i) => (
								<Fragment key={group.label}>
									{i > 0 && <DropdownMenuSeparator />}
									<DropdownMenuGroup>
										<DropdownMenuLabel>{group.label}</DropdownMenuLabel>
										{group.items.map((item) => (
											<DropdownMenuItem key={item.href} render={<Link href={prefix + item.href} />} className={cn(path.startsWith(item.href) && "bg-muted")}>
												<item.icon />
												{item.label}
											</DropdownMenuItem>
										))}
									</DropdownMenuGroup>
								</Fragment>
							))}
						</DropdownMenuContent>
					</DropdownMenu>
					{/* games are played on real history, so Play leaves any universe */}
					<Link href="/play" className={cn(navItem, "inline-flex items-center gap-1.5", pathname.startsWith("/play") && "text-foreground bg-muted")}>
						<Gamepad2 className="size-3.5" />
						Play
					</Link>
				</nav>
				<div className="ml-auto flex items-center gap-2">
					<SiteSearch prefix={prefix} />
					<Link
						href="/lab"
						className={cn(buttonVariants({
							variant: "outline",
							className: cn("border-universe/40 text-universe hover:text-universe hover:bg-universe/10", pathname.startsWith("/lab") && "bg-universe/10"),
						}))}
					>
						<FlaskConical data-icon="inline-start" />
						Lab
					</Link>
					<Button
						variant="ghost"
						size="icon"
						aria-label="Toggle theme"
						onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
					>
						<Sun className="size-4 dark:hidden" />
						<Moon className="hidden size-4 dark:block" />
					</Button>
				</div>
			</div>
		</header>
	);
}
