import Constants from "expo-constants";

/**
 * The website the app takes its data from: EXPO_PUBLIC_PITWALL_ORIGIN (e.g. a dev server on the
 * local network), then app.json's extra.pitwallOrigin, then the live site.
 */
export const ORIGIN = (process.env.EXPO_PUBLIC_PITWALL_ORIGIN ?? (Constants.expoConfig?.extra?.pitwallOrigin as string | undefined) ?? "https://pitwall.phaseo.app").replace(/\/$/, "");

/** A file under the website's /data (the dataset, lap charts, game files). */
export const dataUrl = (path: string) => `${ORIGIN}/data/${path.replace(/^\//, "")}`;

/** The same page on the website, for sharing. */
export const webUrl = (path: string) => `${ORIGIN}${path.startsWith("/") ? path : `/${path}`}`;
