// /privacy and /terms. Plain words, kept true to what the code does: no accounts, analytics or cookies on the
// website; browser storage only; the Android app's ads (AdMob) and "Remove ads" purchase (Google Play, RevenueCat).
// Update UPDATED and the text together whenever any of that changes.

import Link from "next/link";
import { Page, PageHeader } from "../f1";

const UPDATED = "16 November 2026";
const EMAIL = "support@phaseo.app";

function Mail() {
	return (
		<a className="text-foreground underline" href={`mailto:${EMAIL}`}>
			{EMAIL}
		</a>
	);
}

function Ext({ href, children }: { href: string; children: React.ReactNode }) {
	return (
		<a className="text-foreground underline" href={href} rel="noreferrer">
			{children}
		</a>
	);
}

function Doc({ title, intro, children }: { title: string; intro: React.ReactNode; children: React.ReactNode }) {
	return (
		<Page>
			<PageHeader eyebrow={`Last updated ${UPDATED}`} title={title}>
				{intro}
			</PageHeader>
			<div className="text-muted-foreground max-w-3xl space-y-8 leading-relaxed [&_h2]:text-foreground [&_h2]:text-lg [&_h2]:font-semibold [&_li]:pl-1 [&_section]:space-y-3 [&_strong]:text-foreground [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-5">
				{children}
			</div>
		</Page>
	);
}

export function PrivacyPage() {
	return (
		<Doc
			title="Privacy policy"
			intro="Pitwall doesn't have accounts, analytics or tracking cookies, and almost everything you do stays on your own device. This page explains the little that doesn't."
		>
			<section>
				<h2>Who we are</h2>
				<p>
					Pitwall (the website at pitwall.phaseo.app, its AI server and the Pitwall Android app) is run by Phaseo, which is the data controller
					for the information described here. Contact us about anything on this page at <Mail />.
				</p>
			</section>

			<section>
				<h2>The website</h2>
				<ul>
					<li>
						<strong>No accounts, analytics, advertising or tracking cookies.</strong> You never sign in or give us your name or email to use the
						site.
					</li>
					<li>
						<strong>Hosting logs.</strong> The site is hosted by Vercel. Like any web host, it records basic details of each request so it
						can serve and protect the site: your IP address, the address you asked for, the time, your browser&apos;s user agent and the page
						that linked you. Vercel keeps these logs for a limited time. We use them only to keep the site running and secure, never to
						profile you.
					</li>
					<li>
						<strong>Stored on your device.</strong> Your theme, game results and streaks, fantasy teams and Lab universes are saved in your
						browser&apos;s storage. They are never sent to us. Clearing this site&apos;s data in your browser removes them.
					</li>
					<li>
						<strong>Shared universe links.</strong> When you share a Lab universe, it travels inside the link itself, after the #, which
						browsers don&apos;t send to servers. We never receive it, but anyone you give the link to can open it.
					</li>
				</ul>
			</section>

			<section>
				<h2>AI assistants</h2>
				<p>
					If you connect ChatGPT, Claude or another assistant to Pitwall (see <Link className="text-foreground underline" href="/ai">Use with AI</Link>),
					the assistant sends us the lookups it decides to make, such as a driver&apos;s name, a season or a database query. It does not send us
					your conversation. We answer the lookup and keep nothing beyond the hosting logs above. Your conversation itself is handled by your AI
					provider under their own privacy policy.
				</p>
			</section>

			<section>
				<h2>The Android app</h2>
				<ul>
					<li>
						<strong>Data downloads.</strong> The app downloads Pitwall&apos;s dataset from our website, which creates the same hosting logs as
						a visit. Your Lab universes, game results and settings stay on your phone.
					</li>
					<li>
						<strong>Ads.</strong> The app may show ads from Google AdMob. Where the law requires it (including in the UK and EEA), the app asks
						for your consent first, using Google&apos;s consent form. Google may use your device&apos;s advertising ID, IP address and similar
						information to show ads, measure them and prevent fraud, and to personalise ads only if you agree. You can change your choice at any
						time in the app under <strong>Settings → Ad privacy choices</strong>, or reset your advertising ID in your phone&apos;s settings.
						See <Ext href="https://policies.google.com/technologies/partner-sites">how Google uses information from apps that use its services</Ext>.
					</li>
					<li>
						<strong>Remove ads.</strong> If you buy ad-free, Google Play takes the payment and RevenueCat records the purchase against an
						anonymous app ID so it can be restored on your other phones. We never see your card details. Once a phone is ad-free, it no longer
						loads Google&apos;s ad software at all.
					</li>
				</ul>
			</section>

			<section>
				<h2>Why we can use it</h2>
				<p>
					Under UK data protection law, we rely on our legitimate interest in running a secure, working service for hosting logs; on your consent
					for personalised ads; and on our contract with you for the ad-free purchase.
				</p>
			</section>

			<section>
				<h2>Who else receives it</h2>
				<ul>
					<li>Vercel, our host.</li>
					<li>Google, for ads in the Android app and for Google Play purchases.</li>
					<li>RevenueCat, which manages the ad-free purchase.</li>
				</ul>
				<p>
					Some of these companies process data in the United States. They protect transfers using recognised safeguards, such as the UK
					International Data Transfer Addendum or the UK Extension to the EU–US Data Privacy Framework. We never sell your information.
				</p>
			</section>

			<section>
				<h2>Your rights</h2>
				<p>
					You can ask to see, correct or delete personal information we hold about you, object to or restrict how we use it, take a copy of it,
					or withdraw your consent at any time. Email <Mail />. Because we hold so little, and nothing tied to a name, we may not be able to
					find anything that relates to you. If you&apos;re unhappy with how we handle your information, you can complain to the{" "}
					<Ext href="https://ico.org.uk/make-a-complaint/">Information Commissioner&apos;s Office</Ext>.
				</p>
			</section>

			<section>
				<h2>Children</h2>
				<p>Pitwall is not aimed at children under 13.</p>
			</section>

			<section>
				<h2>Changes</h2>
				<p>If what Pitwall collects changes, we&apos;ll update this page and the date at the top.</p>
			</section>
		</Doc>
	);
}

export function TermsPage() {
	return (
		<Doc
			title="Terms of use"
			intro={
				<>
					These terms cover the Pitwall website, its AI server and the Pitwall Android app. By using them you agree to these terms and our{" "}
					<Link className="text-foreground underline" href="/privacy">
						privacy policy
					</Link>
					.
				</>
			}
		>
			<section>
				<h2>Who we are</h2>
				<p>
					Pitwall is run by Phaseo. Contact us at <Mail />.
				</p>
			</section>

			<section>
				<h2>Not official</h2>
				<p>
					Pitwall is an unofficial fan project. It is not associated in any way with the Formula 1 companies. F1, FORMULA ONE, FORMULA 1, FIA
					FORMULA ONE WORLD CHAMPIONSHIP, GRAND PRIX and related marks are trade marks of Formula One Licensing B.V.
				</p>
			</section>

			<section>
				<h2>The data</h2>
				<ul>
					<li>
						Pitwall&apos;s statistics come from <Ext href="https://github.com/f1db/f1db">F1DB</Ext> (CC BY 4.0) and{" "}
						<Ext href="https://github.com/jolpica/jolpica-f1">Jolpica F1</Ext> (for non-commercial use). If you reuse the data, follow their
						licences.
					</li>
					<li>
						We work to keep it accurate, but it may contain mistakes or gaps. Don&apos;t rely on it where an error could cost you, for
						example when betting.
					</li>
					<li>Anything made in the Lab, and anything shown inside a universe, is fiction.</li>
					<li>
						When you use Pitwall through an AI assistant, the assistant writes the answer, not us, and it can get things wrong. Check anything
						important against the Pitwall pages it links to.
					</li>
				</ul>
			</section>

			<section>
				<h2>Fair use</h2>
				<p>You may use Pitwall freely for personal, non-commercial purposes. Please don&apos;t:</p>
				<ul>
					<li>send so many automated requests, including through the AI server, that it slows Pitwall down for others;</li>
					<li>try to break, overload or get around the limits of the site, the app or the AI server;</li>
					<li>copy Pitwall&apos;s data or pages into a commercial product; or</li>
					<li>use Pitwall for anything unlawful, or share universes with offensive content.</li>
				</ul>
				<p>We may limit or block access that breaks these rules.</p>
			</section>

			<section>
				<h2>Purchases in the app</h2>
				<p>
					&quot;Remove ads&quot; is a one-off purchase made through Google Play, which handles payment and refunds under its own terms. This
					doesn&apos;t affect your legal rights as a consumer.
				</p>
			</section>

			<section>
				<h2>Changes and availability</h2>
				<p>
					Pitwall is free and provided as it is. We may change, pause or stop any part of it, including the AI server, at any time. If we change
					these terms, we&apos;ll update this page and the date at the top. Continuing to use Pitwall means you accept the new terms.
				</p>
			</section>

			<section>
				<h2>Liability</h2>
				<p>
					Nothing in these terms limits liability that can&apos;t be limited by law, such as for death or personal injury caused by negligence,
					or for fraud, and nothing affects your statutory rights as a consumer. Otherwise, as Pitwall is a free service, we aren&apos;t liable
					for any loss that comes from using it or relying on its data.
				</p>
			</section>

			<section>
				<h2>Law</h2>
				<p>
					These terms are governed by the law of England and Wales, and disputes go to the courts of England and Wales. If you live in Scotland
					or Northern Ireland, you can also bring a claim in your local courts.
				</p>
			</section>
		</Doc>
	);
}
