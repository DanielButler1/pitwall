// Downloads the latest free Jolpica F1 database dump (CSV) into ./jolpica,
// which scripts/build-data.mjs uses as a supplement to F1DB (lap-by-lap
// positions and times, pit stops).
//
//   node scripts/update-jolpica.mjs
//   JOLPICA_DUMP_URL=https://... node scripts/update-jolpica.mjs
//
// Jolpica (https://github.com/jolpica/jolpica-f1, the Ergast successor): the
// free "delayed" dump lags 14 days and is for non-commercial use; credit Jolpica.

import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { unzipSync } from "fflate";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dest = join(root, "jolpica");
const url = process.env.JOLPICA_DUMP_URL ?? "https://api.jolpi.ca/data/dumps/download/delayed/";
const headers = { "User-Agent": "pitwall-jolpica-updater" };

console.log(`Downloading the Jolpica dump from ${url}…`);
const res = await fetch(url, { headers, redirect: "follow" });
if (!res.ok) throw new Error(`Jolpica download failed: ${res.status} ${res.statusText}`);
// The API redirects to .../dumps/<YYYY-MM-DD>/csv_<hash>/jolpica-f1-csv.zip
const dumpDate = res.url.match(/dumps\/(\d{4}-\d{2}-\d{2})\//)?.[1] ?? null;
const files = unzipSync(new Uint8Array(await res.arrayBuffer()));

rmSync(dest, { recursive: true, force: true });
mkdirSync(dest, { recursive: true });
let count = 0;
for (const [path, bytes] of Object.entries(files)) {
	const name = path.split("/").pop();
	if (!name?.endsWith(".csv")) continue;
	writeFileSync(join(dest, name), bytes);
	count++;
}
if (!count) throw new Error("The Jolpica dump contained no CSV files");
writeFileSync(
	join(dest, "jolpica-dump.json"),
	JSON.stringify({ source: "https://api.jolpi.ca/data/dumps/download/delayed/", dumpDate, downloadedAt: new Date().toISOString() }, null, 2),
);
console.log(`Installed ${count} CSV files (dump of ${dumpDate ?? "unknown date"}) into ${dest}`);
