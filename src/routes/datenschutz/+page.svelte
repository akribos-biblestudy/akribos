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
			Akribos wird auf einem Hetzner-Cloud-Server betrieben. Beim Aufruf fallen technische
			Zugriffsdaten an (u. a. IP-Adresse, Datum und Uhrzeit des Zugriffs, aufgerufene Seite,
			verwendeter Browser). Die Protokolle des App-Servers werden abhängig von ihrer Größe rotiert:
			Ältere Protokolldateien werden durch neuere ersetzt. Daraus ergibt sich keine feste
			Speicherfrist in Tagen. Diese Daten sind erforderlich, um die Website technisch auszuliefern
			und stabil und sicher zu betreiben. Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO
			(berechtigtes Interesse an einem funktionsfähigen, sicheren Betrieb).
		</p>
	</section>

	<section class="mb-8">
		<h2 class="mb-2 text-lg font-semibold">Konto und Registrierung</h2>
		<p class="text-stone-700 dark:text-stone-300">
			Für ein Akribos-Konto wird eine E-Mail-Adresse benötigt. Neue Konten entstehen erst nach
			Bestätigung dieser Adresse. Bei Konten ohne eingerichtetes Passwort erfolgt die Anmeldung über
			einen per E-Mail versandten Link oder Code. Ein Passwort kann optional im Konto eingerichtet
			werden; bei Konten mit Passwort wird dieses für die Anmeldung abgefragt. Passwörter werden
			ausschließlich als Hashwert gespeichert (Argon2), niemals im Klartext. Diese Daten dienen
			dazu, das Konto und die davon abhängigen Funktionen (Notizen, Markierungen, Stellensammlungen,
			Kommentare und Leseeinstellungen) bereitzustellen. Rechtsgrundlage ist Art. 6 Abs. 1 lit. b
			DSGVO (Erfüllung des Nutzungsverhältnisses).
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
		<h2 class="mb-2 text-lg font-semibold">Native Akribos-App</h2>
		<p class="text-stone-700 dark:text-stone-300">
			Die Akribos-App verbindet sich über HTTPS mit akribos.de, um Bibeltexte, Nachschlagewerke und
			persönliche Inhalte zu laden. Dabei übermittelt die App Anfragen zu gewählten Werken und
			Lesestellen sowie eingegebene Suchbegriffe an den Server; außerdem fallen technische
			Verbindungsdaten an. Öffentlich verfügbare Texte können ohne Anmeldung gelesen werden. Für
			persönliche Funktionen verwendet die App die Anmeldung und die Kennung des Akribos-Kontos.
		</p>
		<p class="mt-3 text-stone-700 dark:text-stone-300">
			Notizen, Ausarbeitungen, Markierungen, Sammlungen und Kommentare werden dem Konto zugeordnet
			auf dem Server gespeichert. Dateianlagen werden nur nach ausdrücklicher Auswahl hochgeladen;
			dabei werden auch Dateiname, Dateityp und Größe übertragen. Durch eine selbst veranlasste
			Freigabe können Inhalte anderen Nutzern oder Empfängern eines Links zugänglich werden. Die
			HTTPS-Verbindung schützt die Übertragung; serverseitig gespeicherte Inhalte sind nicht
			Ende-zu-Ende-verschlüsselt.
		</p>
		<p class="mt-3 text-stone-700 dark:text-stone-300">
			Die native App speichert ihre Anmeldesitzung, geöffneten Tabs und Lesestellen sowie lokale
			Dokumententwürfe im verschlüsselten Plattform-Speicher des Geräts. Kontobezogene Tabs und
			Entwürfe sind dabei nach Server und Konto getrennt. Anzeigeeinstellungen werden ebenfalls
			lokal gespeichert.
		</p>
		<p class="mt-3 text-stone-700 dark:text-stone-300">
			Zum Bearbeiten von Dokumenten öffnet die App eine eingebettete HTTPS-Seite von akribos.de, die
			dieselbe Anmeldung verwendet. Der native Client und diese eingebettete Editorseite laden kein
			Analyse- oder Werbeskript. Für Seiten, die du über einen Link im externen Browser öffnest,
			gelten die dortigen Datenschutzhinweise und gegebenenfalls Einwilligungseinstellungen.
		</p>
		<p class="mt-3 text-stone-700 dark:text-stone-300">
			Beim Teilen wählst du im Systemmenü die empfangende App oder den Empfänger aus. Die
			ausgewählten Inhalte werden an diese übergeben. Für Exporte können Dateien im temporären
			privaten App-Verzeichnis abgelegt werden. Das Abmelden oder Deinstallieren der App löscht
			nicht das serverseitige Akribos-Konto und seine gespeicherten Inhalte. Den Weg für einen
			Löschantrag findest du unter
			<a class="text-accent-600 hover:underline dark:text-accent-400" href="#konto-loeschen"
				>Akribos-Konto und Daten löschen</a
			>.
		</p>
	</section>

	<section class="mb-8">
		<h2 class="mb-2 text-lg font-semibold">Versand von E-Mails</h2>
		<p class="text-stone-700 dark:text-stone-300">
			Für den Versand von Konto-E-Mails (z. B. mit Anmeldelink oder Code sowie zum Zurücksetzen
			eines Passworts) wird der E-Mail-Dienstleister Brevo (Sendinblue SAS, Frankreich) eingesetzt,
			der die dafür nötigen Daten (E-Mail-Adresse, Betreff und Inhalt der Nachricht) in unserem
			Auftrag verarbeitet. Werbliche E-Mails werden nicht versendet.
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
			und der zugehörigen Daten kann jederzeit über den unten beschriebenen
			<a class="text-accent-600 hover:underline dark:text-accent-400" href="#konto-loeschen"
				>Löschantrag</a
			> verlangt werden.
		</p>
	</section>

	<section id="konto-loeschen" class="mb-8 scroll-mt-24">
		<h2 class="mb-2 text-lg font-semibold">Akribos-Konto und Daten löschen</h2>
		<p class="text-stone-700 dark:text-stone-300">
			Du kannst die Löschung deines Akribos-Kontos und der zugehörigen personenbezogenen Daten per
			E-Mail an
			<a
				class="text-accent-600 hover:underline dark:text-accent-400"
				href="mailto:info@akribos.de?subject=Akribos-Konto%20l%C3%B6schen">info@akribos.de</a
			>
			beantragen. Verwende den Betreff „Akribos-Konto löschen“ und sende die Nachricht möglichst von der
			E-Mail-Adresse, die zu deinem Konto gehört.
		</p>
		<p class="mt-3 text-stone-700 dark:text-stone-300">
			Der Antrag umfasst deine Kontodaten, Notizen und Ausarbeitungen, Dateianlagen, Markierungen,
			Sammlungen und Kommentare.
		</p>
		<p class="mt-3 text-stone-700 dark:text-stone-300">
			Wir bearbeiten Löschanträge innerhalb von sieben Tagen. Dabei prüfen wir die Zuordnung des
			Antrags zu deinem Konto, bevor wir Kontodaten löschen. Sende uns dafür kein Passwort und
			keinen Anmeldecode. Dieser Antrag betrifft dein serverseitiges Konto; das bloße Abmelden oder
			Entfernen der App stellt keinen Löschantrag dar.
		</p>
		<p class="mt-3 text-stone-700 dark:text-stone-300">
			Vorhandene Sicherungskopien können ältere Datenstände bis zu ihrer turnusmäßigen Ersetzung
			enthalten. Zusätzliche Sicherungskopien, etwa vor einer Wiederherstellung, fallen nicht unter
			diese reguläre Rotation und müssen bei der Bearbeitung des Löschantrags gesondert
			berücksichtigt werden. Für die Entfernung aus sämtlichen Sicherungskopien ergibt sich daraus
			keine feste Frist in Tagen; die sieben Tage beziehen sich auf die Bearbeitung deines Antrags.
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
