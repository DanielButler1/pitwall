// Render the finite race, driver and season pictures as plain public files. Run after
// prepare-data and before next build (also before next dev). Other pictures, including
// arbitrary comparisons, keep their existing Next.js image routes.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";
import { entityOgImage } from "../src/lib/og-cards";
import { getDb } from "../src/lib/server";
import { staticParams } from "../src/lib/static-params";
import { staticOgUrl, type StaticOgKind } from "../src/lib/static-og";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(root);

const start = performance.now();
const groups: [StaticOgKind, string[]][] = [
	["race", staticParams.races().map(({ year, round }) => `${year}-${round}`)],
	// Profiles also exist for drivers without a race result, outside the driver index/sitemap.
	["driver", [...getDb().drivers.keys()]],
	["season", staticParams.seasons().map(({ year }) => year)],
];
let total = 0;
let bytes = 0;
let largest = 0;
for (const [kind, ids] of groups) {
	let groupBytes = 0;
	for (const id of ids) {
		const response = entityOgImage(kind, id);
		const png = Buffer.from(await response.arrayBuffer());
		// Twitter's smaller image limit is 5 MB; fail the build rather than ship a broken card.
		if (png.length > 5_000_000) throw new Error(`Social image exceeds 5 MB: ${kind}/${id}`);
		const file = join(root, "public", staticOgUrl(kind, id));
		mkdirSync(dirname(file), { recursive: true });
		writeFileSync(file, png);
		groupBytes += png.length;
		largest = Math.max(largest, png.length);
	}
	total += ids.length;
	bytes += groupBytes;
	console.log(`Social images: ${kind}: ${ids.length} files, ${(groupBytes / 1024 / 1024).toFixed(1)} MiB`);
}
console.log(`Social images: ${total} PNGs, ${(bytes / 1024 / 1024).toFixed(1)} MiB, largest ${(largest / 1024).toFixed(0)} KiB, ${((performance.now() - start) / 1000).toFixed(1)}s`);
