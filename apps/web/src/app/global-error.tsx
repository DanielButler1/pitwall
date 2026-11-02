"use client";

// The last resort, when the root layout itself fails: it replaces the whole document, so it brings its own
// <html>, styles and colour scheme (the theme provider isn't there to set one).

import "./globals.css";

export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
	return (
		<html lang="en">
			<body className="flex min-h-dvh items-center justify-center bg-white p-6 text-zinc-950 antialiased [@media(prefers-color-scheme:dark)]:bg-zinc-950 [@media(prefers-color-scheme:dark)]:text-zinc-50">
				<title>Something went wrong | Pitwall</title>
				<main className="max-w-md space-y-4 text-center">
					<h1 className="text-2xl font-semibold tracking-tight">Something went wrong</h1>
					<p className="text-sm text-zinc-500">Pitwall ran into a problem on our side. Try again in a moment.</p>
					<div className="flex justify-center gap-2">
						<button onClick={() => retry()} className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700">
							Try again
						</button>
						{/* a full page load, since the app around this page is what failed */}
						<a href="/" className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium [@media(prefers-color-scheme:dark)]:border-zinc-700">
							Home
						</a>
					</div>
					{error.digest && <p className="text-xs text-zinc-500">Reference {error.digest}</p>}
				</main>
			</body>
		</html>
	);
}
