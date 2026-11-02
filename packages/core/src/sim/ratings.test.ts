import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { hydrate, indexData } from "../f1/dataset.ts";
import { ageEffect, CUSTOMER, deriveRatings, skillAt } from "./ratings.ts";
import { dataFile } from "../test-data.ts";

const base = indexData(hydrate(JSON.parse(readFileSync(dataFile, "utf8"))));
const R = deriveRatings(base);

test("ratings are derived once per dataset and are deterministic", () => {
	assert.equal(deriveRatings(base), R);
	const again = deriveRatings(indexData(hydrate(JSON.parse(readFileSync(dataFile, "utf8")))));
	assert.equal(again.drivers.get("ayrton-senna")!.get(1988)!.skill, R.drivers.get("ayrton-senna")!.get(1988)!.skill);
});

test("teammate comparisons separate the driver from the car", () => {
	// a dominant car is still rated as a top car
	const rank = (team: string, y: number) =>
		[...R.teams].filter(([id, m]) => m.has(y) && !id.endsWith(CUSTOMER)).sort((a, b) => b[1].get(y)!.car - a[1].get(y)!.car).findIndex(([id]) => id === team) + 1;
	assert.ok(rank("williams", 1992) <= 2, `williams 1992 #${rank("williams", 1992)}`);
});

test("clearly dominant cars rate as the best car of their season", () => {
	const dominant: [string, number][] = [
		["mclaren", 1988],
		["williams", 1992],
		["ferrari", 2002],
		["ferrari", 2004],
		["red-bull", 2011],
	];
	const best = (y: number) =>
		[...R.teams].filter(([id, m]) => m.has(y) && !id.endsWith(CUSTOMER)).sort((a, b) => b[1].get(y)!.car - a[1].get(y)!.car)[0][0];
	const misses = dominant.filter(([team, y]) => best(y) !== team).map(([team, y]) => `${team} ${y} (best: ${best(y)})`);
	assert.ok(misses.length <= 1, `not rated the best car: ${misses.join(", ")}`);
});

test("every season is normalised: mean driver skill 0, spreads stable across eras", () => {
	const decades = new Map<number, number[]>();
	for (const [y, s] of R.seasons) {
		const list = [...R.drivers.values()].map((m) => m.get(y)).filter((x) => x != null);
		const w = list.reduce((a, x) => a + x.starts, 0);
		const mean = list.reduce((a, x) => a + x.skill * x.starts, 0) / w;
		assert.ok(Math.abs(mean) < 1.5, `${y} weighted mean skill ${mean.toFixed(2)}`);
		const d = Math.floor(y / 10) * 10;
		(decades.get(d) ?? decades.set(d, []).get(d)!).push(s.driverSd);
	}
	const sds = [...decades.values()].map((xs) => xs.reduce((a, b) => a + b, 0) / xs.length);
	assert.ok(Math.max(...sds) / Math.min(...sds) < 2, `decade driver SDs ${sds.map((x) => x.toFixed(1)).join(" ")}`);
});

test("ageing curve: improve to the late 20s, plateau, decline after 34", () => {
	assert.ok(ageEffect(20) < ageEffect(24));
	assert.ok(ageEffect(24) < ageEffect(27));
	assert.equal(ageEffect(29), 0);
	assert.equal(ageEffect(31), 0);
	assert.ok(ageEffect(36) < ageEffect(33));
	assert.ok(ageEffect(42) < -15);
});

test("skill projects beyond a real career with the ageing curve", () => {
	const last = R.drivers.get("alain-prost")!.get(1993)!.skill;
	assert.ok(skillAt(R, base, "alain-prost", 1998) < last - 3, "Prost at 43 should be well past his peak");
	assert.ok(Number.isFinite(skillAt(R, base, "nobody-at-all", 2000)));
});
