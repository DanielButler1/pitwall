import type { Metadata } from "next";
import { CircuitGame } from "@/components/play/circuit-guess";

export const metadata: Metadata = {
	title: "Guess the circuit",
	description: "A daily Formula 1 puzzle: guess the mystery circuit in eight tries from its country, distance and direction, layout and Grand Prix history.",
};

export default function Page() {
	return <CircuitGame />;
}
