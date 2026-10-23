"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CircleAlert, FlaskConical } from "lucide-react";
import { cn } from "@/lib/utils";
import { decodeUniverse } from "@pitwall/core/universe/share";
import { openShared } from "@/lib/universe/store";
import { buttonVariants } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Spinner } from "@/components/ui/spinner";

/** Unpacks a share link into this browser's universes, then shows it like any other. */
export function ShareOpener() {
	const router = useRouter();
	const [error, setError] = useState<string | null>(null);
	useEffect(() => {
		let alive = true;
		const data = window.location.hash.slice(1);
		if (!data) return void setError("This link has no universe in it. Was it copied in full?");
		decodeUniverse(data)
			.then(openShared)
			.then(({ id, existing }) => {
				if (!alive) return;
				if (existing) toast.info("Already in your Lab", { description: `This link has the same changes as “${existing.name}”.` });
				router.replace(`/u/${id}`);
			})
			.catch((e: Error) => alive && setError(e.message));
		return () => {
			alive = false;
		};
	}, [router]);

	return (
		<Empty className="min-h-[60vh]">
			<EmptyHeader>
				<EmptyMedia variant="icon">{error ? <CircleAlert /> : <Spinner />}</EmptyMedia>
				<EmptyTitle>{error ? "Couldn't open this universe" : "Opening a shared universe"}</EmptyTitle>
				<EmptyDescription>{error ?? "Unpacking the changes from the link."}</EmptyDescription>
			</EmptyHeader>
			{error && (
				<EmptyContent>
					<Link href="/lab" className={cn(buttonVariants())}>
						<FlaskConical data-icon="inline-start" />
						Open the Lab
					</Link>
				</EmptyContent>
			)}
		</Empty>
	);
}
