import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PropsWithChildren } from "react";

const DAY = 24 * 60 * 60 * 1000;

/**
 * For the few files fetched on demand (a race's lap chart and pit stops): everything else is built on
 * the device from the dataset (src/data/dataset.ts). Past races never change, so nothing goes stale.
 */
export const queryClient = new QueryClient({
	defaultOptions: {
		queries: { staleTime: Infinity, gcTime: DAY, retry: 1, networkMode: "offlineFirst" },
	},
});

export function QueryProvider({ children }: PropsWithChildren) {
	return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
