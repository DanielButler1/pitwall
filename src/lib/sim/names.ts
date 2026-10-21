// Generated drivers and teams for simulated futures. Names are drawn from small
// per-nationality lists with a seeded stream, so the same seed always produces
// the same people. Nationalities are F1DB country ids.

import type { Constructor, Driver } from "../f1/dataset.ts";
import { pick, randInt, type Rand } from "./random.ts";

const NAMES: Record<string, { weight: number; first: string[]; last: string[] }> = {
	"united-kingdom": {
		weight: 14,
		first: ["Oliver", "Harry", "Jack", "George", "Charlie", "Alfie", "Thomas", "James", "Callum", "Ethan", "Archie", "Freddie", "Lewis", "Rory"],
		last: ["Hartley", "Whitmore", "Ashford", "Pennington", "Bramley", "Calloway", "Fairbairn", "Holloway", "Kingsley", "Marsden", "Rowntree", "Thornton", "Wexley", "Ellison"],
	},
	italy: {
		weight: 9,
		first: ["Lorenzo", "Matteo", "Alessandro", "Davide", "Riccardo", "Francesco", "Gabriele", "Tommaso", "Leonardo", "Andrea", "Edoardo", "Nicolò"],
		last: ["Bellandi", "Castellucci", "Ferraresi", "Galvani", "Lombardini", "Marchetti", "Orsolini", "Pellegrino", "Rinaldi", "Sartori", "Valsecchi", "Zanetti"],
	},
	germany: {
		weight: 8,
		first: ["Lukas", "Felix", "Jonas", "Maximilian", "Leon", "Niklas", "Moritz", "Paul", "Tim", "Finn", "Julian", "Elias"],
		last: ["Brandauer", "Eichhorn", "Falkenberg", "Hartmann", "Kessler", "Lindemann", "Neuhaus", "Reinholt", "Schreiber", "Vogtmann", "Winterfeld", "Zeller"],
	},
	france: {
		weight: 8,
		first: ["Hugo", "Théo", "Louis", "Gabriel", "Arthur", "Raphaël", "Jules", "Mathis", "Victor", "Antoine", "Baptiste", "Clément"],
		last: ["Aubertin", "Beaulieu", "Chevalier", "Delacroix", "Fontaine", "Garnier", "Lacoste", "Marchand", "Perrault", "Rousseau", "Vasseur", "Morel"],
	},
	netherlands: {
		weight: 4,
		first: ["Daan", "Sem", "Luuk", "Bram", "Thijs", "Jesse", "Ruben", "Milan"],
		last: ["van Dijkhuizen", "de Vries-Bakker", "Hoogland", "Kuipers", "Brouwer", "van der Linde", "Visscher", "Mulder"],
	},
	spain: {
		weight: 5,
		first: ["Pablo", "Álvaro", "Hugo", "Mateo", "Javier", "Diego", "Sergio", "Adrián", "Iker"],
		last: ["Aranda", "Castillo", "Echeverría", "Navarro", "Olmedo", "Quintana", "Serrano", "Valverde", "Zubiri"],
	},
	brazil: {
		weight: 5,
		first: ["Gabriel", "Lucas", "Matheus", "Rafael", "Pedro", "Thiago", "Felipe", "Enzo", "Bruno"],
		last: ["Albuquerque", "Bragança", "Carvalho", "Drummond", "Figueira", "Monteiro", "Pacheco", "Sampaio", "Teixeira"],
	},
	"united-states-of-america": {
		weight: 5,
		first: ["Tyler", "Mason", "Logan", "Carter", "Wyatt", "Hunter", "Cole", "Austin", "Brody"],
		last: ["Brennan", "Caldwell", "Donovan", "Gallagher", "Harlan", "McAllister", "Prescott", "Sutherland", "Whitaker"],
	},
	australia: {
		weight: 4,
		first: ["Cooper", "Riley", "Lachlan", "Jett", "Harrison", "Mitchell", "Bailey", "Flynn"],
		last: ["Ashcroft", "Blackwood", "Doherty", "Kilpatrick", "McGrath", "Rendell", "Sinclair", "Tremayne"],
	},
	finland: {
		weight: 3,
		first: ["Eetu", "Onni", "Aleksi", "Joonas", "Lauri", "Veeti", "Kalle", "Niko"],
		last: ["Haapala", "Kallio", "Lehtinen", "Mäkelä", "Nurminen", "Rautio", "Salonen", "Virtanen"],
	},
	japan: {
		weight: 3,
		first: ["Haruto", "Ren", "Sota", "Yuto", "Riku", "Kaito", "Daiki", "Takumi"],
		last: ["Fujimoto", "Hayashida", "Kaneshiro", "Matsuura", "Nakagawa", "Okamoto", "Sakurai", "Takeda"],
	},
	mexico: {
		weight: 3,
		first: ["Santiago", "Emiliano", "Diego", "Rodrigo", "Andrés", "Leonardo"],
		last: ["Cervantes", "Escobedo", "Gallardo", "Iturbide", "Montemayor", "Villaseñor"],
	},
	canada: {
		weight: 2,
		first: ["Liam", "Noah", "Owen", "Nathan", "Gavin", "Xavier"],
		last: ["Beaumont", "Gagnon", "MacKenzie", "Tremblay", "Lachance", "Fraser"],
	},
	belgium: {
		weight: 2,
		first: ["Arthur", "Louis", "Lucas", "Jules", "Noah", "Victor"],
		last: ["Claessens", "Dumont", "Janssens", "Lambrecht", "Peeters", "Verhaegen"],
	},
	denmark: { weight: 2, first: ["Magnus", "Oscar", "William", "Emil", "Noah"], last: ["Kjeldsen", "Lindholm", "Rasmussen", "Skovgaard", "Thygesen"] },
	austria: { weight: 2, first: ["Lukas", "Tobias", "Florian", "Simon", "Fabian"], last: ["Aichinger", "Gruber", "Hofstätter", "Pichler", "Wallner"] },
	switzerland: { weight: 1, first: ["Nico", "Luca", "Gian", "Noah"], last: ["Ammann", "Brunner", "Keller", "Zbinden"] },
	sweden: { weight: 1, first: ["Elias", "Hugo", "Viktor", "Axel"], last: ["Ekström", "Lindqvist", "Sandberg", "Wallin"] },
	china: { weight: 2, first: ["Haoran", "Yichen", "Zihan", "Junjie", "Ruoxi"], last: ["Chen", "Liang", "Wang", "Zhou", "Xu"] },
	argentina: { weight: 1, first: ["Mateo", "Bautista", "Joaquín", "Thiago"], last: ["Echenique", "Ferreyra", "Pagliaro", "Sosa"] },
	"new-zealand": { weight: 1, first: ["Hamish", "Lachie", "Fergus", "Angus"], last: ["Aitken", "McCaw", "Rutherford", "Tane"] },
	monaco: { weight: 1, first: ["Louis", "Charles", "Arthur"], last: ["Bellando", "Gastaud", "Rosticher"] },
	india: { weight: 1, first: ["Arjun", "Rohan", "Kabir", "Vihaan"], last: ["Chandok", "Malhotra", "Reddy", "Sethi"] },
};

const NATION_POOL = Object.entries(NAMES).flatMap(([id, n]) => Array<string>(n.weight).fill(id));

/** A generated rookie, born `age` years before `year`. */
export function makeDriver(rand: Rand, id: string, year: number, age: number, taken: Set<string>): Driver {
	let nationality = pick(rand, NATION_POOL);
	let firstName = "";
	let lastName = "";
	for (let tries = 0; tries < 20; tries++) {
		const n = NAMES[nationality];
		firstName = pick(rand, n.first);
		lastName = pick(rand, n.last);
		if (!taken.has(`${firstName} ${lastName}`)) break;
		nationality = pick(rand, NATION_POOL);
	}
	const name = `${firstName} ${lastName}`;
	taken.add(name);
	const month = randInt(rand, 1, 12);
	const day = randInt(rand, 1, 28);
	return {
		id,
		name,
		firstName,
		lastName,
		abbreviation: lastName.replace(/^(van der |van |de )/i, "").replace(/[^A-Za-zÀ-ÿ]/g, "").slice(0, 3).toUpperCase(),
		number: null,
		dateOfBirth: `${year - age - (month > 6 ? 1 : 0)}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
		dateOfDeath: null,
		nationality,
		placeOfBirth: null,
		gender: "M",
	};
}

const TEAM_NAMES: [string, string][] = [
	["Meridian", "united-kingdom"],
	["Aurora", "germany"],
	["Vanguard", "united-states-of-america"],
	["Halcyon", "italy"],
	["Corsair", "france"],
	["Stellaris", "switzerland"],
	["Orion", "netherlands"],
	["Kestrel", "united-kingdom"],
	["Sirocco", "spain"],
	["Valkyrie", "sweden"],
	["Tempest", "australia"],
	["Zenith", "japan"],
	["Ascendant", "canada"],
	["Lumen", "belgium"],
	["Nimbus", "austria"],
	["Polaris", "finland"],
];

export function makeTeam(rand: Rand, id: string, taken: Set<string>): Constructor {
	const free = TEAM_NAMES.filter(([n]) => !taken.has(n));
	const [name, country] = free.length ? pick(rand, free) : [`Team ${id.split("-").pop()}`, "united-kingdom"];
	taken.add(name);
	return { id, name, fullName: `${name} Racing`, country };
}
