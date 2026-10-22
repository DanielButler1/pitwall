import type { Metadata } from "next";
import { NameGridGame } from "@/components/play/name-grid";

export const metadata: Metadata = {
	title: "Name the grid",
	description: "A daily Formula 1 puzzle: one race's starting grid, team by team. Name every starter you can in three minutes.",
};

export default function Page() {
	return <NameGridGame />;
}
