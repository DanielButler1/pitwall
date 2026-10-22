"use client";

import { Fragment, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import {
	BookOpen,
	CalendarClock,
	CalendarDays,
	ChevronDown,
	CircleDot,
	Cog,
	Factory,
	FlaskConical,
	Gamepad2,
	GitCompareArrows,
	Globe,
	ListOrdered,
	Medal,
	Menu,
	Moon,
	Route,
	Sun,
	Trophy,
	User,
} from "lucide-react";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { SiteSearch } from "./site-search";

const NAV = [
	{ href: "/seasons", label: "Seasons", icon: CalendarDays },
	{ href: "/drivers", label: "Drivers", icon: User },
	{ href: "/constructors", label: "Constructors", icon: Factory },
	{ href: "/circuits", label: "Circuits", icon: Route },
	{ href: "/records", label: "Records", icon: Medal },
	{ href: "/diary", label: "Diary", icon: BookOpen },
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
			<div className="flex h-14 w-full items-center gap-3 px-4 sm:px-6 lg:gap-4 xl:gap-6 xl:px-10">
				<Link href={prefix || "/"} className="flex shrink-0 items-center gap-2 font-semibold tracking-tight">
					<span className="bg-f1 inline-block h-5 w-1.5 -skew-x-12 rounded-sm" />
					Pitwall
				</Link>
				<nav className="hidden min-w-0 items-center gap-1 text-sm lg:flex">
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
				<div className="ml-auto flex items-center gap-1.5 sm:gap-2">
					<SiteSearch prefix={prefix} />
					<Link
						href="/lab"
						aria-label="Lab"
						className={cn(
							buttonVariants({
								variant: "outline",
								className: cn(
									"border-universe/40 text-universe hover:text-universe hover:bg-universe/10 w-8 px-0 sm:w-auto sm:px-3",
									pathname.startsWith("/lab") && "bg-universe/10",
								),
							}),
						)}
					>
						<FlaskConical />
						<span className="hidden sm:inline">Lab</span>
					</Link>
					<Button variant="ghost" size="icon" aria-label="Toggle theme" onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}>
						<Sun className="size-4 dark:hidden" />
						<Moon className="hidden size-4 dark:block" />
					</Button>
					<MobileNav prefix={prefix} path={path} pathname={pathname} />
				</div>
			</div>
		</header>
	);
}

const sheetItem = "hover:bg-muted flex items-center gap-3 rounded-lg px-3 py-2.5 text-[15px] transition-colors [&_svg]:size-4 [&_svg]:text-muted-foreground";

/** Below lg the nav lives in a sheet. */
function MobileNav({ prefix, path, pathname }: { prefix: string; path: string; pathname: string }) {
	const [open, setOpen] = useState(false);
	// close once the next page is showing
	useEffect(() => setOpen(false), [pathname]);
	const groups = [{ label: "Explore", items: NAV }, ...MORE_GROUPS];
	return (
		<Sheet open={open} onOpenChange={setOpen}>
			<SheetTrigger render={<Button variant="ghost" size="icon" aria-label="Menu" className="lg:hidden" />}>
				<Menu className="size-5" />
			</SheetTrigger>
			<SheetContent side="right" className="w-[min(20rem,85vw)] gap-0 p-0">
				<SheetHeader className="border-b">
					<SheetTitle className="flex items-center gap-2">
						<span className="bg-f1 inline-block h-5 w-1.5 -skew-x-12 rounded-sm" />
						Pitwall
					</SheetTitle>
				</SheetHeader>
				<ScrollArea className="min-h-0 flex-1">
					<nav className="space-y-4 p-3">
						{groups.map((group) => (
							<div key={group.label}>
								<div className="text-muted-foreground px-3 pb-1 text-xs font-medium">{group.label}</div>
								{group.items.map((item) => (
									<Link
										key={item.href}
										href={prefix + item.href}
										onClick={() => setOpen(false)} className={cn(sheetItem, path.startsWith(item.href) && "bg-muted font-medium")}
									>
										<item.icon />
										{item.label}
									</Link>
								))}
							</div>
						))}
						<div>
							<div className="text-muted-foreground px-3 pb-1 text-xs font-medium">Play and build</div>
							<Link href="/play" onClick={() => setOpen(false)} className={cn(sheetItem, pathname.startsWith("/play") && "bg-muted font-medium")}>
								<Gamepad2 />
								Play
							</Link>
							<Link href="/lab" onClick={() => setOpen(false)} className={cn(sheetItem, "text-universe [&_svg]:text-universe", pathname.startsWith("/lab") && "bg-universe/10 font-medium")}>
								<FlaskConical />
								Lab
							</Link>
						</div>
					</nav>
				</ScrollArea>
			</SheetContent>
		</Sheet>
	);
}
