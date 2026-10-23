// The website's compare colours (apps/web/src/components/pages/compare-colors.ts): a fixed order,
// checked for colour-blind separation and contrast on both themes.

import type { CompareEntity } from "@pitwall/core/f1/compare";

export const COMPARE_COLORS = ["#e7000b", "#0084d1", "#b08210", "#8b4fd6"];

export const nameOf = (e: CompareEntity) => e.driver?.name ?? e.team?.name ?? e.id;

/** Surname for drivers ("Schumacher"), the name for teams. */
export const shortName = (e: CompareEntity) => (e.driver ? (e.driver.name.split(" ").at(-1) ?? e.driver.name) : nameOf(e));
