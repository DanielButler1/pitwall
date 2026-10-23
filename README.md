# Pitwall

Formula 1 statistics from 1950 to today, and a Lab for rewriting history.

Browse every season, race, driver, constructor, circuit and record, then change something (a result, a points system, a driver's career, whole decades of history) and browse the entire site again as that alternate universe.

## What's in it

- **History**: seasons with round-by-round championship charts, race results with lap charts and pit stops (from 1996), driver and constructor profiles with team-mate head-to-heads, circuits, Grands Prix, engines, tyres and nations.
- **Records**: around 580 record categories, each with its chronology.
- **Diary**: what happened on every day of the year: races, birthdays, debuts, first wins and titles decided.
- **Tools**: compare up to four careers side by side, re-score every championship under any points system (or one you design), and see which milestones and records the current grid is closing in on.
- **The Lab**: re-simulate races, seasons or all of history; edit results; move drivers between seats; tune car and driver performance. Every page of the site then reflects your universe, and a "What changed" report shows titles, records and careers that moved. Universes can be shared as links.
- **Play**: a daily "Guess the driver" puzzle, and "Fantasy: Through the Eras", where you draft driver-seasons from any era on a budget.
- Hover any driver, team, race, circuit, engine, tyre, Grand Prix, nation or season for a summary card, and search everything with <kbd>Ctrl</kbd>+<kbd>K</kbd>.

## Repository layout

A pnpm workspace:

- `apps/web`: the website (Next.js).
- `apps/mobile`: the Android app (Expo, React Native): every section of the website, built on the device from the same dataset and logic, working offline. See [apps/mobile/README.md](apps/mobile/README.md).
- `packages/core`: the shared logic, plain TypeScript with no dependencies: the dataset, one view model per page, records, the diary, the games, the race simulator and universes. The website runs it on the server and in the browser, the app on the phone; the tests live here.

## Running it locally

You need Node.js 22.18 or later and [pnpm](https://pnpm.io).

```bash
pnpm install
pnpm dev
```

The first `pnpm dev` downloads the pinned data sources (about 20 MB) and builds the dataset, which takes a minute or two. After that it starts in seconds.

| Command | What it does |
| --- | --- |
| `pnpm dev` | Development server on http://localhost:3000 |
| `pnpm build` | Production build of the website |
| `pnpm test` | Unit tests |
| `pnpm typecheck` | TypeScript |
| `pnpm data:update` | Move `apps/web/data/sources.json` to the newest F1DB release and Jolpica dump, then rebuild the dataset |
| `pnpm data` | Rebuild the dataset from the downloaded sources |

## Data

- **[F1DB](https://github.com/f1db/f1db)** (CC BY 4.0) is the main source: every season, race, result, standing, driver, constructor, engine and circuit.
- **[Jolpica F1](https://github.com/jolpica/jolpica-f1)** adds lap-by-lap positions and times since 1996, laps led, sprint laps and pit stops. Its free dump runs about 14 days behind and is for non-commercial use, credited to Jolpica.

No data is stored in this repository. `apps/web/data/sources.json` pins the versions, builds download them, and a daily GitHub Action ([`data-update.yml`](.github/workflows/data-update.yml)) moves the pins forward when a new F1DB release (usually the day after a Grand Prix) or Jolpica dump appears. That commit is what redeploys the site.

Pitwall is not affiliated with Formula 1, the FIA or any team. F1, Formula 1 and related marks belong to their owners.

## Deploying

The website is a Next.js app. Index pages, the current season and the current grid are prerendered at build time; every other page renders on its first visit and is then cached, which keeps each deployment small. On Vercel, import the repository with **Root Directory** set to `apps/web` and keep the other defaults; each push to `main`, including the daily data commits, redeploys it.

## Contributing

Contributions are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md), and [docs/architecture.md](docs/architecture.md) for how the code fits together.

## Licence

The code is released under the [PolyForm Noncommercial License 1.0.0](LICENSE.md): you can use, change and share it for any non-commercial purpose. The data keeps its sources' licences (F1DB: CC BY 4.0; Jolpica: non-commercial, with credit).
