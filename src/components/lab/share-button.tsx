"use client";

import { useState } from "react";
import { toast } from "sonner";
import { BookmarkPlus, Link2, Trash2 } from "lucide-react";
import type { Universe } from "@/lib/universe/apply";
import { LONG_LINK, shareUrl } from "@/lib/universe/share";
import { deleteUniverse, keepShared } from "@/lib/universe/store";
import { num } from "@/components/f1";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

/** Copy a link that opens this universe in anyone's browser (the universe travels inside the link). */
export async function copyShareLink(u: Pick<Universe, "name" | "description" | "changes">) {
	try {
		const url = await shareUrl(window.location.origin, u);
		await navigator.clipboard.writeText(url);
		const length = `${num(url.length)} characters`;
		if (url.length > LONG_LINK)
			toast.warning("Share link copied, but it's long", {
				description: `${length}. Some chat apps and email clients cut long links off; if it doesn't open, send the JSON from the Lab instead.`,
			});
		else toast.success("Share link copied", { description: `${length}. Anyone with the link can open “${u.name}”.` });
	} catch (e) {
		toast.error("Couldn't copy the share link", { description: (e as Error).message });
	}
}

export function ShareButton({ universe, className, ...props }: { universe: Pick<Universe, "name" | "description" | "changes">; className?: string } & Pick<React.ComponentProps<typeof Button>, "variant" | "size">) {
	const [busy, setBusy] = useState(false);
	return (
		<Button
			{...props}
			className={className}
			disabled={busy}
			onClick={async () => {
				setBusy(true);
				await copyShareLink(universe);
				setBusy(false);
			}}
		>
			{busy ? <Spinner data-icon="inline-start" /> : <Link2 data-icon="inline-start" />}
			Share
		</Button>
	);
}

/** Banner actions for a universe opened from someone's link: keep it, or throw it away. */
export function SharedActions({ universe, onDiscard }: { universe: Universe; onDiscard: () => void }) {
	return (
		<>
			<Button
				size="sm"
				className="bg-universe hover:bg-universe/90 text-white"
				onClick={async () => {
					await keepShared(universe);
					toast.success("Saved to your Lab", { description: "You can now edit it, and it's listed with your universes." });
				}}
			>
				<BookmarkPlus data-icon="inline-start" />
				Save to my Lab
			</Button>
			<Button
				variant="ghost"
				size="sm"
				onClick={async () => {
					onDiscard();
					await deleteUniverse(universe.id);
				}}
			>
				<Trash2 data-icon="inline-start" />
				Discard
			</Button>
		</>
	);
}
