# Hosting and page payloads

Pitwall's historical data is static between deployments, but an on-demand Next.js page still needs a function to render its first response and stores HTML and RSC artifacts in Vercel ISR. A new deployment gets a fresh ISR cache. Crawlers visiting thousands of different archive URLs can therefore cause substantial cache writes even though the data does not change.

The indexed archive is built with `staticParams` during `next build`. The sitemap and page generation share that catalogue. Team-mate pairings are also built in both orders, as linked from driver profiles; invalid pairings return 404. Valid additional profiles retain on-demand generation, custom comparison metadata/images remain dynamic, and the home page refreshes hourly for its UTC date. AI crawlers remain allowed.

Build-time rendering removes the archive's first-request rendering work; it does not promise zero Vercel ISR reads or origin transfer. Vercel's App Router adapter still uses prerender assets, and regional cache misses can consume resources. Check actual post-deployment usage rather than inferring a billing reduction directly from artifact sizes.

## Compact page payloads

The table-heavy page views receive plain view data at a client boundary. Their HTML is still rendered by Next.js, with titles, links and results present before JavaScript runs. Their RSC navigation payloads serialize the data rather than the much larger tree of styled table cells, tooltips and links. Data processing stays in server route files; these views already support browser rendering inside universes.

Local production builds of the same data and Next.js version on 9 November 2026 measured:

| Page | HTML before → after | RSC before → after | Gzipped RSC before → after | Additional gzipped initial JS |
| --- | ---: | ---: | ---: | ---: |
| Season 2026 | 1,823,535 → 530,176 B | 1,233,436 → 73,085 B | 47,212 → 9,673 B | 4,902 B |
| Diary index | 2,553,225 → 353,121 B | 2,116,992 → 130,805 B | 56,394 → 17,053 B | 33,140 B |
| Race 2026/1 | 449,125 → 203,497 B | 256,330 → 34,357 B | 15,927 → 6,137 B | 5,103 B |
| Lewis Hamilton | 528,884 → 364,529 B | 268,103 → 112,300 B | 19,579 → 12,353 B | 7,453 B |
| Ferrari | 1,480,039 → 719,792 B | 789,245 → 108,605 B | 32,235 → 12,394 B | 7,453 B |

The tradeoff is more browser rendering code, especially for the diary. These are local artifact measurements, not measured Vercel billing savings. Gzip is a reproducible comparison; Vercel may negotiate another compression format.

The full archive build generated 3,617 pages in 61 seconds of prerendering on the development machine. HTML, RSC (including segment copies) and route bodies totalled about 971 MiB locally; social images and JS/CSS are additional. Build time, deployment storage and function packaging must be checked on Vercel as well. A previous full build with serialized table markup was approximately 1.7 GB, which prompted the earlier switch to on-demand rendering.

## Verification after deployment

1. Confirm the historical race, season, driver, entity, diary and record paths appear in the build's prerender output.
2. Check server-rendered HTML, hydration, client navigation, race tabs and the diary's mobile month controls.
3. Compare daily ISR write/read units, active CPU and origin transfer after the deployment has settled, using equal date windows. The current rolling total includes earlier releases and will not fall immediately.
4. Check deployment storage and cache status alongside runtime usage. Preserve AI crawler access; diagnose low cache hit rates rather than blocking those crawlers.

## Remaining comparisons

On 10 November, after the project moved to the `phaseo` team, the production Functions table identified team-mate pages, comparison images and comparison metadata as the leading remaining CPU users. The leading ISR route table showed no writes for the prebuilt race, driver, season, constructor, record or diary pages; team-mate pages still generated on request. The dashboard's selected window was 12 hours, but the transfer limited the new team's history to roughly an hour. These observations cannot establish a daily trend, and widget totals should not be summed with route-table aggregates.

`teammatePairs` enumerates drivers entered for the same constructor in the same race, including shared drives and non-starters. The page build covers both URL orders so each driver's profile can still place that driver on the left. This removes first-request generation for the finite real-history pairings and trades runtime work for a larger build. The sitemap does not add these URLs or encourage a new crawl. Team-mate share images still generate on demand.

The local production build generated 14,473 pages, including 10,856 team-mate paths, with 3.6 minutes of prerendering. HTML, RSC (including segment copies) and route bodies totalled about 2,189 MiB across 86,601 files; team-mate artifacts account for about 1,218 MiB. These are local Next.js artifacts, not the Vercel deployment's packaged size. Preview packaging must pass before merging.

The comparison page only needs names for server metadata; `compareNames` looks them up without building career charts or snapshots. Share images use `compareSummary`, which calculates totals and the two-way head-to-head used by the card, while the full interactive comparison remains in the browser. Tests check these projections against the existing full comparison.

`/compare` sets `Vercel-CDN-Cache-Control: public, max-age=31536000`. Its public HTML and metadata depend only on the query and deployed data; Vercel must retain distinct query and HTML/RSC cache variants. Browser caching still follows Next.js's response policy. `/og/compare` also uses a one-year shared-cache lifetime, with a one-hour browser lifetime. Deployment-scoped caches refresh on the next release. Custom query combinations remain unbounded and can still invoke functions on cache misses.

Local production HTTP checks passed for both team-mate orders, an older pairing, invalid-pair 404s, on-demand team-mate share images, driver/team/reversed/empty/unknown comparison metadata, HTML versus RSC content types and comparison PNG dimensions/cache headers. Before merging, verify separate driver/team query titles, HTML versus RSC content types, and a repeat-request cache hit in the Vercel preview. Also check build duration and deployment packaging for the enlarged team-mate archive. A local benchmark or smaller calculation is not a measurement of Vercel billing savings.
