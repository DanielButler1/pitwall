// Unpacks race cards in the browser. Kept apart from cards.ts, which pulls in the
// stats code, so the hover cards on real-history pages stay light.

import type { CardRef, CardsFile, PackedRace, RaceCard } from "./cards.ts";

/** A packed race card with names filled in from the other cards. */
export function expandRaceCard(key: string, p: PackedRace, cards: CardsFile): RaceCard {
	const [year, round] = key.split("-").map(Number);
	const [name, date, flag, circuitId, laps, distance, rounds, podium, pole, fastest, sprint] = p;
	const driver = (id: string): CardRef => ({ id, name: cards.d[id]?.name ?? id });
	const team = (id: string): CardRef => ({ id, name: cards.t[id]?.name ?? id });
	const circuit = cards.c[circuitId];
	return {
		kind: "race",
		name,
		year,
		round,
		rounds,
		date,
		flag,
		circuit: { id: circuitId, name: circuit?.name ?? circuitId, place: circuit?.place ?? "" },
		laps,
		distance,
		upcoming: !podium.length,
		podium: podium.map(([d, t, time]) => ({ driver: driver(d), team: team(t), time })),
		pole: pole ? driver(pole) : null,
		fastestLap: fastest ? { ...driver(fastest[0]), time: fastest[1] } : null,
		sprintWinner: sprint ? driver(sprint) : null,
	};
}
