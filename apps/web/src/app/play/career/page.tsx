import type { Metadata } from "next";
import { CareerGame } from "@/components/play/career";

export const metadata: Metadata = {
	title: "Career path",
	description: "A daily Formula 1 puzzle: name the mystery driver from their career, revealed team by team, in six tries.",
};

export default function Page() {
	return <CareerGame />;
}
