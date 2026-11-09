# Hosting and page payloads

Pitwall's historical data is static between deployments, but an on-demand Next.js page still needs a function to render its first response and stores HTML and RSC artifacts in Vercel ISR. A new deployment gets a fresh ISR cache. Crawlers visiting thousands of different archive URLs can therefore cause substantial cache writes even though the data does not change.

The indexed archive is now built with `staticParams` during `next build`. The sitemap and page generation share that catalogue. Valid additional profiles and team-mate pairings retain on-demand generation, custom comparison metadata/images remain dynamic, and the home page refreshes hourly for its UTC date. AI crawlers remain allowed.

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
