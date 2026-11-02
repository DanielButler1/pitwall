"use client";

// Shown in place of a page that failed to render, inside the site header and footer.

import Link from "next/link";
import { CircleAlert, RotateCw } from "lucide-react";
import { Page } from "@/components/f1";
import { Button, buttonVariants } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";

export default function Error({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
	return (
		<Page>
			<title>Something went wrong | Pitwall</title>
			<Empty className="min-h-[60vh]">
				<EmptyHeader>
					<EmptyMedia variant="icon">
						<CircleAlert />
					</EmptyMedia>
					<EmptyTitle>Something went wrong</EmptyTitle>
					<EmptyDescription>This page ran into a problem on our side. Try again, or head back to the start.</EmptyDescription>
				</EmptyHeader>
				<EmptyContent className="flex-row justify-center gap-2">
					<Button onClick={() => retry()}>
						<RotateCw /> Try again
					</Button>
					<Link href="/" className={buttonVariants({ variant: "outline" })}>
						Home
					</Link>
				</EmptyContent>
				{error.digest && <p className="text-muted-foreground text-xs">Reference {error.digest}</p>}
			</Empty>
		</Page>
	);
}
