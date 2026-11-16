"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "../ui/button";

async function copy(text: string, what: string): Promise<boolean> {
	try {
		await navigator.clipboard.writeText(text);
		toast.success(`${what} copied`);
		return true;
	} catch {
		toast.error("Couldn't copy to the clipboard");
		return false;
	}
}

/** A copy button that ticks for a moment after copying. */
export function CopyButton({ text, what = "Copied", label = "Copy", className }: { text: string; what?: string; label?: string; className?: string }) {
	const [done, setDone] = useState(false);
	return (
		<Button
			variant="outline"
			size="sm"
			className={cn("shrink-0", className)}
			aria-label={`${label}: ${text}`}
			onClick={async () => {
				if (await copy(text, what)) {
					setDone(true);
					setTimeout(() => setDone(false), 1600);
				}
			}}
		>
			{done ? <Check /> : <Copy />}
			{label}
		</Button>
	);
}

/** A line of code (a URL, a command or a config snippet) with its copy button. */
export function CodeLine({ code, what }: { code: string; what: string }) {
	const multiline = code.includes("\n");
	return (
		<div className={cn("bg-muted/60 flex gap-2 rounded-lg border p-1.5 pl-3", multiline ? "items-start" : "items-center")}>
			<pre className="min-w-0 flex-1 overflow-x-auto py-1 font-mono text-[13px] leading-relaxed">{code}</pre>
			<CopyButton text={code} what={what} />
		</div>
	);
}

/** An example question: click it to copy it into your assistant. */
export function ExampleQuestion({ text, icon }: { text: string; icon: React.ReactNode }) {
	return (
		<button
			type="button"
			onClick={() => copy(text, "Question")}
			className="bg-card ring-foreground/5 hover:ring-foreground/20 dark:ring-foreground/10 group flex w-full items-start gap-3 rounded-xl p-4 text-left text-sm shadow-sm ring-1 transition-shadow"
		>
			<span className="text-muted-foreground mt-0.5 shrink-0 [&_svg]:size-4">{icon}</span>
			<span className="min-w-0 flex-1 text-pretty">{text}</span>
			<Copy className="text-muted-foreground mt-0.5 size-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
		</button>
	);
}
