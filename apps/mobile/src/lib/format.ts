// Formatting shared by every screen, matching the website's (apps/web/src/components/f1.tsx).

const whole = new Intl.NumberFormat("en-GB");
const decimal = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 2 });

/** 1,166 and 12.5: thousands separated, at most two decimals. */
export const num = (n: number) => (Number.isInteger(n) ? whole.format(n) : decimal.format(n));

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "3 Sep 2023": three-letter months everywhere (en-GB formatting says "Sept"). */
export const fmtDate = (iso: string) => {
	const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
	return `${d} ${MON[m! - 1]} ${y}`;
};

/** "3 Sep": a date within a season. */
export const fmtDay = (iso: string) => {
	const [, m, d] = iso.slice(0, 10).split("-").map(Number);
	return `${d} ${MON[m! - 1]}`;
};

/** "1988–1993", or just "2007" for one season; "2021–" while still racing. */
export const yearRange = (from: number | null | undefined, to?: number | null, ongoing = false) => {
	if (from == null) return "";
	if (ongoing) return `${from}–`;
	return to == null || to === from ? String(from) : `${from}–${to}`;
};

/** "1 win", "3 wins". */
export const plural = (n: number, one: string, many = `${one}s`) => `${num(n)} ${n === 1 ? one : many}`;

/** "1st", "22nd", "113th". */
export const ordinal = (n: number) => n + (n % 100 >= 11 && n % 100 <= 13 ? "th" : (["th", "st", "nd", "rd"][n % 10] ?? "th"));

/**
 * A country's flag from its ISO alpha-2 code, as an emoji (regional indicator letters): no image
 * files, and Android and iOS both draw them. "EU" works too; an unknown code gives "".
 */
export const flagEmoji = (code: string | null | undefined) => {
	if (!code || !/^[a-z]{2}$/i.test(code)) return "";
	return String.fromCodePoint(...[...code.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
};
