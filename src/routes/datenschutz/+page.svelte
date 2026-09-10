<script lang="ts">
	let { data } = $props();
</script>

<svelte:head>
	<meta name="robots" content="noindex" />
</svelte:head>

<main class="prose-like mx-auto w-full max-w-2xl px-4 py-8">
	<h1 class="mb-6 text-2xl font-semibold">Datenschutzerklärung</h1>

	<section class="mb-8">
		<h2 class="mb-2 text-lg font-semibold">Verantwortlicher</h2>
		<p class="text-stone-700 dark:text-stone-300">
			Mirko Hecky<br />
			Hosleite 13<br />
			95478 Kemnath<br />
			E-Mail:
			<a class="text-accent-600 hover:underline dark:text-accent-400" href="mailto:info@akribos.de"
				>info@akribos.de</a
			>
		</p>
	</section>

	<section class="mb-8">
		<h2 class="mb-2 text-lg font-semibold">Server-Logfiles</h2>
		<p class="text-stone-700 dark:text-stone-300">
			Beim Aufruf dieser Website verarbeitet der Hosting-Anbieter automatisch technische
			Zugriffsdaten (u. a. IP-Adresse, Datum und Uhrzeit des Zugriffs, aufgerufene Seite,
			verwendeter Browser) in sogenannten Server-Logfiles. Diese Daten sind erforderlich, um die
			Website technisch auszuliefern und stabil und sicher zu betreiben. Rechtsgrundlage ist Art. 6
			Abs. 1 lit. f DSGVO (berechtigtes Interesse an einem funktionsfähigen, sicheren Betrieb).
		</p>
	</section>

	<section class="mb-8">
		<h2 class="mb-2 text-lg font-semibold">Konto und Registrierung</h2>
		<p class="text-stone-700 dark:text-stone-300">
			Wer sich registriert, hinterlegt eine E-Mail-Adresse und ein Passwort. Das Passwort wird
			ausschließlich als Hashwert gespeichert (Argon2), niemals im Klartext. Diese Daten dienen
			dazu, das Konto und die davon abhängigen Funktionen (Stellensammlungen, Kommentare,
			Leseeinstellungen) bereitzustellen. Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO (Erfüllung
			des Nutzungsverhältnisses).
		</p>
	</section>

	<section class="mb-8">
		<h2 class="mb-2 text-lg font-semibold">Sitzungs-Cookie</h2>
		<p class="text-stone-700 dark:text-stone-300">
			Nach der Anmeldung setzt Akribos ein Cookie, das ausschließlich ein zufälliges Sitzungs-Token
			enthält; der Anmeldestatus selbst wird serverseitig gespeichert. Ohne dieses Cookie könnte die
			Website den Anmeldestatus nicht erhalten. Es ist damit technisch notwendig im Sinne von § 25
			Abs. 2 TDDDG und erfordert keine gesonderte Einwilligung.
		</p>
	</section>

	<section class="mb-8">
		<h2 class="mb-2 text-lg font-semibold">Weitere technische Cookies</h2>
		<p class="text-stone-700 dark:text-stone-300">
			Weitere Cookies speichern ausschließlich Anzeigeeinstellungen: das gewählte Farbschema, die
			Kachelanordnung, geöffnete Ressourcen-Tabs und deren Tabgruppen A–E, die Schriftgröße sowie
			die zuletzt gelesene Stelle. Sie dienen allein dazu, diese Einstellungen beim nächsten Besuch
			wiederherzustellen, werden nicht zu Werbe- oder Analysezwecken verwendet und nicht an Dritte
			weitergegeben. Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO; auch sie sind technisch
			notwendig im Sinne von § 25 Abs. 2 TDDDG.
		</p>
	</section>

	<section class="mb-8">
		<h2 class="mb-2 text-lg font-semibold">Reader-Zustand in der Adresse</h2>
		<p class="text-stone-700 dark:text-stone-300">
			Damit Neuladen, das Duplizieren eines Browser-Tabs und kopierte Links dieselbe Reader-Ansicht
			öffnen, enthält die Adresse mehrere lesbare Zustandsparameter. Darin stehen Kachellayout,
			geöffnete Werke, Tabgruppen, Lesestellen, Lexikon-Kontext und ein aktuell angezeigter
			Suchbegriff. Diese Angaben sind damit auch Teil des Browserverlaufs und eines kopierten Links.
			Ein solcher Link überschreibt beim Empfänger nicht dessen dauerhaft gespeicherten persönlichen
			Arbeitsbereich.
		</p>
	</section>

	<section class="mb-8">
		<h2 class="mb-2 text-lg font-semibold">Schutz vor missbräuchlichen Anmeldeversuchen</h2>
		<p class="text-stone-700 dark:text-stone-300">
			Bei Anmeldungen und Passwort-Zurücksetzungen werden die eingegebene E-Mail-Adresse und die
			IP-Adresse für ein kurzes Zeitfenster gespeichert, um wiederholte automatisierte Versuche zu
			erkennen und zu verlangsamen. Diese Daten werden danach automatisch wieder gelöscht.
			Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse an der Sicherheit der
			Konten).
		</p>
	</section>

	<section class="mb-8">
		<h2 class="mb-2 text-lg font-semibold">Stellensammlungen und Kommentare</h2>
		<p class="text-stone-700 dark:text-stone-300">
			Stellensammlungen und Kommentare, die ein Konto anlegt, werden diesem Konto zugeordnet
			gespeichert. Eine Liste wird nur dann für andere ohne eigenes Konto einsehbar, wenn sie
			ausdrücklich über einen Link freigegeben wird; das geschieht ausschließlich auf eigene
			Veranlassung. Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO, für die Freigabe zusätzlich Art.
			6 Abs. 1 lit. a DSGVO.
		</p>
	</section>

	<section class="mb-8">
		<h2 class="mb-2 text-lg font-semibold">Versand von E-Mails</h2>
		<p class="text-stone-700 dark:text-stone-300">
			Für den Versand von Konto-E-Mails (z. B. zum Zurücksetzen eines Passworts) wird der
			E-Mail-Dienstleister Brevo (Sendinblue SAS, Frankreich) eingesetzt, der die dafür nötigen
			Daten (E-Mail-Adresse, Betreff und Inhalt der Nachricht) in unserem Auftrag verarbeitet.
			Werbliche E-Mails werden nicht versendet.
		</p>
	</section>

	<section id="umami" class="mb-8">
		<h2 class="mb-2 text-lg font-semibold">Freiwillige Nutzungsanalyse mit Umami</h2>
		{#if data.analytics.enabled}
			<p class="text-stone-700 dark:text-stone-300">
				Mit deiner Einwilligung verwenden wir Umami, um die Nutzung allgemeiner Seitenbereiche zu
				verstehen und Akribos zu verbessern. Das Analyseskript wird erst nach deiner Zustimmung
				geladen. Rechtsgrundlage sind Art. 6 Abs. 1 lit. a DSGVO und, soweit auf Informationen
				deines Endgeräts zugegriffen wird, § 25 Abs. 1 TDDDG.
			</p>
			<p class="mt-3 text-stone-700 dark:text-stone-300">
				Betreiber: {data.analytics.provider}. Das Skript wird von {new URL(data.analytics.scriptUrl)
					.origin} geladen. Wir übermitteln nur die allgemeine Seitenkategorie (etwa „Reader“ oder „Hilfe“),
				den festen Titel „Akribos“ und unsere Umami-Website-Kennung. Konkrete Bibelstellen, Suchbegriffe,
				Ressourcen, URL-Parameter, Referrer sowie Inhalte oder IDs von Notizen und Konten gehören nicht
				zu den Analyseereignissen. Konto-, Dokument- und Verwaltungsseiten werden nicht gezählt. Automatische
				Klickaufzeichnung, Sitzungsaufzeichnung und Leistungsaufzeichnung sind ausgeschaltet.
			</p>
			<p class="mt-3 text-stone-700 dark:text-stone-300">
				Umami kann zusätzlich den Hostnamen dieser Website und eine vom Analyseserver gelieferte,
				nur im Arbeitsspeicher gehaltene Sitzungskennung zur technischen Zuordnung übertragen. Diese
				wird nicht mit deinem Akribos-Konto verknüpft. Beim Laden des Skripts und bei der
				Übertragung fallen beim Betreiber technische Verbindungsdaten wie die IP-Adresse und
				Browserkennung an. Weitere Angaben zur dortigen Verarbeitung und Speicherdauer:
			</p>
			<p class="mt-2 whitespace-pre-line text-stone-700 dark:text-stone-300">
				{data.analytics.privacyDetails}
			</p>
			<p class="mt-2">
				<a
					href={data.analytics.privacyUrl}
					rel="noreferrer"
					class="text-accent-600 underline dark:text-accent-400"
					>Datenschutzhinweise des Analysebetreibers</a
				>
			</p>
			<p class="mt-3 text-stone-700 dark:text-stone-300">
				Deine Entscheidung kannst du über „Freiwillige Nutzungsanalyse“ am unteren Seitenrand
				jederzeit ändern oder widerrufen. Der Widerruf gilt für zukünftige Übertragungen; die
				Rechtmäßigkeit der bisherigen Verarbeitung bleibt unberührt. Akribos bleibt auch bei
				Ablehnung vollständig nutzbar. „Do Not Track“ und „Global Privacy Control“ im Browser
				verhindern das Laden.
			</p>
		{:else}
			<p class="text-stone-700 dark:text-stone-300">
				Die freiwillige Umami-Nutzungsanalyse ist derzeit deaktiviert. Es wird kein Umami-Skript
				geladen und es werden keine Analyseereignisse übertragen.
			</p>
		{/if}
		<p class="mt-3 text-stone-700 dark:text-stone-300">
			Wenn du eine Entscheidung triffst, speichert Akribos sie für 180 Tage im Cookie
			„analytics-consent“. Es enthält nur Zustimmung oder Ablehnung und die zugehörige
			Konfigurationskennung, keine Nutzerkennung. Dieses Cookie dient ausschließlich dazu, deine
			Entscheidung zu beachten (§ 25 Abs. 2 Nr. 2 TDDDG). Die Einbindung setzt keine
			Analyse-Cookies.
		</p>
	</section>

	<section class="mb-8">
		<h2 class="mb-2 text-lg font-semibold">Speicherdauer</h2>
		<p class="text-stone-700 dark:text-stone-300">
			Kontobezogene Daten werden gespeichert, solange das Konto besteht. Eine Löschung des Kontos
			und der zugehörigen Daten kann jederzeit formlos per E-Mail an
			<a class="text-accent-600 hover:underline dark:text-accent-400" href="mailto:info@akribos.de"
				>info@akribos.de</a
			> verlangt werden.
		</p>
	</section>

	<section>
		<h2 class="mb-2 text-lg font-semibold">Rechte der betroffenen Person</h2>
		<p class="text-stone-700 dark:text-stone-300">
			Es besteht das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung,
			Datenübertragbarkeit sowie Widerspruch gegen die Verarbeitung (Art. 15–21 DSGVO). Anfragen
			dazu richten sich an die oben genannte Kontaktadresse. Außerdem besteht ein Beschwerderecht
			bei einer Datenschutz-Aufsichtsbehörde, etwa der für den eigenen Wohnort zuständigen.
		</p>
	</section>
</main>
