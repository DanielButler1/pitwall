import type { Metadata } from "next";
import { GridGame } from "@/components/play/grid";

export const metadata: Metadata = {
	title: "Grid of nine",
	description: "A daily Formula 1 puzzle: fill a 3×3 grid with drivers who fit each row and column, from teams and nationalities to decades and feats.",
};

export default function Page() {
	return <GridGame />;
}
