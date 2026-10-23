import type { Metadata } from "next";
import { ConstructorGame } from "@/components/play/constructor-guess";

export const metadata: Metadata = {
	title: "Guess the constructor",
	description: "A daily Formula 1 puzzle: guess the mystery constructor in eight tries from nationality, years, engines and results.",
};

export default function Page() {
	return <ConstructorGame />;
}
