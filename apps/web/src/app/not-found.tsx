// Shown for addresses that don't exist and for pages that call notFound() (an unknown driver, race or season).

import type { Metadata } from "next";
import Link from "next/link";
import { SearchX } from "lucide-react";
import { Page } from "@/components/f1";
import { buttonVariants } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";

export const metadata: Metadata = { title: "Page not found" };

export default function NotFound() {
	return (
		<Page>
			<Empty className="min-h-[60vh]">
				<EmptyHeader>
					<EmptyMedia variant="icon">
						<SearchX />
					</EmptyMedia>
					<EmptyTitle>Page not found</EmptyTitle>
					<EmptyDescription>There's nothing at this address. It may have moved, or the link has a typo. The search at the top finds any driver, team, race or circuit.</EmptyDescription>
				</EmptyHeader>
				<EmptyContent className="flex-row justify-center gap-2">
					<Link href="/" className={buttonVariants()}>
						Home
					</Link>
					<Link href="/seasons" className={buttonVariants({ variant: "outline" })}>
						Seasons
					</Link>
				</EmptyContent>
			</Empty>
		</Page>
	);
}
