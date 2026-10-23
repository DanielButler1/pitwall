import { useCallback, useRef, type ComponentRef, type ReactNode, type RefObject } from "react";
import { ScrollView, type LayoutChangeEvent } from "react-native";
import { ReadableWidth } from "@/components/ui";

/**
 * Like the kit's Page, plus a way to scroll to one section: the stat tiles jump down to
 * "All results", as the website's tiles link to #results.
 */
export function useJump() {
	const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
	const target = useRef(0);
	const onTargetLayout = useCallback((e: LayoutChangeEvent) => {
		target.current = e.nativeEvent.layout.y;
	}, []);
	const jump = useCallback(() => scroll.current?.scrollTo({ y: Math.max(0, target.current - 8), animated: true }), []);
	return { scroll, onTargetLayout, jump };
}

export function ScrollPage({ scroll, children }: { scroll: RefObject<ComponentRef<typeof ScrollView> | null>; children: ReactNode }) {
	return (
		<ScrollView ref={scroll} contentContainerClassName="pb-10" keyboardShouldPersistTaps="handled">
			<ReadableWidth>{children}</ReadableWidth>
		</ScrollView>
	);
}
