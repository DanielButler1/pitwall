import type { Href } from "expo-router";
import { TabList, TabSlot, TabTrigger, Tabs } from "expo-router/ui";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { NAV_ITEMS } from "@/components/shell/navigation";
import { TabButton } from "@/components/shell/TabButton";
import { Text } from "@/components/ui";
import { UniverseBanner } from "@/features/lab/components/UniverseBanner";
import { useLayout } from "@/hooks/useLayout";
import { cn } from "@/lib/cn";

/**
 * One tab navigator, two looks (as in Phaseo): a bottom bar on phones, and a sidebar on tablets
 * and unfolded foldables (an icon rail below 1024 dp, labelled above). The hidden TabList
 * declares the routes; the visible bars are TabTriggers that switch between them.
 */
export default function AppLayout() {
	const { split, wide } = useLayout();
	return (
		<Tabs style={{ flex: 1, flexDirection: split ? "row" : "column" }}>
			{split ? <Sidebar labelled={wide} /> : null}
			<View className="flex-1 bg-background">
				<TabSlot />
				<UniverseBanner />
			</View>
			{!split ? <BottomBar /> : null}
			<TabList style={{ display: "none" }}>
				{NAV_ITEMS.map((item) => (
					<TabTrigger key={item.name} name={item.name} href={item.href as Href} />
				))}
			</TabList>
		</Tabs>
	);
}

function BottomBar() {
	const insets = useSafeAreaInsets();
	return (
		<View className="flex-row border-t border-border bg-background" style={{ paddingBottom: Math.max(insets.bottom, 6) }}>
			{NAV_ITEMS.map((item) => (
				<TabTrigger key={item.name} name={item.name} asChild>
					<TabButton label={item.label} icon={item.icon} layout="bar" />
				</TabTrigger>
			))}
		</View>
	);
}

function Sidebar({ labelled }: { labelled: boolean }) {
	const insets = useSafeAreaInsets();
	return (
		<View className={cn("border-r border-sidebar-border bg-sidebar", labelled ? "w-60 px-3" : "w-20 items-center")} style={{ paddingTop: insets.top + 12, paddingBottom: insets.bottom + 12 }}>
			<View className={cn("mb-4 flex-row items-center gap-2", labelled && "px-3")}>
				<View className="h-5 w-1.5 -skew-x-12 rounded-sm bg-primary" />
				{labelled ? <Text variant="heading">Pitwall</Text> : null}
			</View>
			<View className={cn(labelled ? "gap-0.5" : "gap-1")}>
				{NAV_ITEMS.map((item) => (
					<TabTrigger key={item.name} name={item.name} asChild>
						<TabButton label={item.label} icon={item.icon} layout={labelled ? "sidebar" : "rail"} />
					</TabTrigger>
				))}
			</View>
		</View>
	);
}
