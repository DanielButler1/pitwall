// Small pieces the part-1 games share: the answer's title in a reveal, in-app links inside text,
// labelled lines, and the "Guess 2 of 8" line under the picker.

import { Dices, type LucideIcon } from "lucide-react-native";
import type { ReactNode } from "react";
import { Pressable, View } from "react-native";
import { Flag } from "@/components/f1";
import { Button, Icon, Text } from "@/components/ui";
import { cn } from "@/lib/cn";
import { useOpen } from "@/lib/links";

/** The answer in a reveal: a big flag (or icon), the name linking to its page, a line under it. */
export function RevealTitle({ flag, icon, title, subtitle, href }: { flag?: string | null; icon?: LucideIcon; title: string; subtitle?: string; href?: string }) {
	const open = useOpen();
	return (
		<View className="flex-row items-center gap-3">
			{icon ? <Icon icon={icon} tone="muted" size={30} /> : <Flag code={flag} className="text-[30px] leading-[38px]" />}
			<View className="flex-1">
				<Pressable disabled={!href} onPress={() => href && open(href)} accessibilityRole={href ? "link" : undefined} className="active:opacity-70">
					<Text variant="title" className={href ? "text-link" : undefined}>
						{title}
					</Text>
				</Pressable>
				{subtitle ? <Text variant="muted">{subtitle}</Text> : null}
			</View>
		</View>
	);
}

/** A name that opens its page (in the current tab). */
export function LinkText({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
	const open = useOpen();
	return (
		<Text accessibilityRole="link" onPress={() => open(href)} className={cn("font-semibold text-link", className)} suppressHighlighting>
			{children}
		</Text>
	);
}

/** A label above its content, for reveals ("Engines", "Notable drivers"). */
export function Detail({ label, children }: { label: string; children: ReactNode }) {
	return (
		<View className="gap-0.5">
			<Text variant="caption">{label}</Text>
			{typeof children === "string" ? <Text variant="small">{children}</Text> : children}
		</View>
	);
}

/** Links separated by commas, in one wrapping line of text. */
export function LinkList({ items }: { items: { key: string; href: string; label: string; extra?: string }[] }) {
	return (
		<Text variant="small">
			{items.map((it, i) => (
				<Text key={it.key} variant="small">
					<LinkText href={it.href}>{it.label}</LinkText>
					{it.extra ? <Text variant="small" className="text-muted-foreground">{` ${it.extra}`}</Text> : null}
					{i < items.length - 1 ? ", " : ""}
				</Text>
			))}
		</Text>
	);
}

/** "Guess 2 of 8" under the picker, with "New driver" in practice. */
export function GuessFooter({ text, practice, newLabel, onNew }: { text: string; practice: boolean; newLabel: string; onNew: () => void }) {
	return (
		<View className="min-h-10 flex-row items-center justify-between gap-3 px-4">
			<Text variant="caption" className="flex-1">
				{text}
			</Text>
			{practice ? <Button label={newLabel} icon={Dices} variant="ghost" size="sm" onPress={onNew} /> : null}
		</View>
	);
}

/** The status line on the result card for the six-or-eight-guess games. */
export function resultStatus(won: boolean, guesses: number, max: number, lost: string, first = "First time! Got it in 1.") {
	if (!won) return lost;
	return guesses === 1 ? first : `Got it in ${guesses} of ${max}.`;
}
