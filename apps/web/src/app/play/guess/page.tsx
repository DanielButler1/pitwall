import type { Metadata } from "next";
import { GuessGame } from "@/components/play/guess";

export const metadata: Metadata = {
	title: "Guess the driver",
	description: "A daily Formula 1 puzzle: guess the mystery driver in eight tries from nationality, career, teams and results.",
};

export default function Page() {
	return <GuessGame />;
}
