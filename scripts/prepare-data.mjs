// Makes sure the data matches data/sources.json: downloads the pinned F1DB release and the
// Jolpica dump when they're missing or out of date, then rebuilds data/f1.json if needed.
// Runs before `pnpm dev` and `pnpm build`, so a fresh clone needs no separate data step.
//
//   node scripts/prepare-data.mjs           (only what's missing or stale)
//   node scripts/prepare-data.mjs --force   (always rebuild data/f1.json)

import { execFileSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { localF1db, localJolpica, readSources, root, sourcesFile } from "./lib/sources.mjs";

const run = (script, args = [], env = {}) =>
	execFileSync(process.execPath, [join(root, "scripts", script), ...args], { stdio: "inherit", env: { ...process.env, ...env } });

const pinned = readSources();
let fetched = false;
if (localF1db() !== pinned.f1db) {
	run("update-f1db.mjs", [pinned.f1db]);
	fetched = true;
}
const jolpica = localJolpica();
// the dump can only be fetched at its newest, so anything at least as new as the pin is fine
if (!jolpica || jolpica < pinned.jolpica) {
	run("update-jolpica.mjs");
	fetched = true;
}

const data = join(root, "data", "f1.json");
const stale = !existsSync(data) || statSync(data).mtimeMs < statSync(sourcesFile).mtimeMs;
if (fetched || stale || process.argv.includes("--force")) run("build-data.mjs");
