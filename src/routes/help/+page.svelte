<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';

	const chapters = [
		{
			href: '#erste-schritte',
			number: '01',
			title: 'Erste Schritte',
			description: 'In wenigen Minuten loslesen'
		},
		{
			href: '#bibelstellen',
			number: '02',
			title: 'Bibelstellen finden',
			description: 'Tab-Feld, Buchauswahl und Navigation'
		},
		{
			href: '#reader',
			number: '03',
			title: 'Lesen & vergleichen',
			description: 'Spalten, Scrollen und Darstellung'
		},
		{
			href: '#strong',
			number: '04',
			title: 'Strong & Urtext',
			description: 'Wörterbuch, Grammatik und Vorkommen'
		},
		{
			href: '#suchen',
			number: '05',
			title: 'Im Bibeltext suchen',
			description: 'Wörter, Wortgruppen und Filter'
		},
		{
			href: '#verse',
			number: '06',
			title: 'Mit Versen arbeiten',
			description: 'Kopieren, markieren und Notizen verknüpfen'
		},
		{
			href: '#listen',
			number: '07',
			title: 'Stellensammlungen',
			description: 'Sammeln, ordnen und teilen'
		},
		{
			href: '#konto',
			number: '08',
			title: 'Konto & Einstellungen',
			description: 'Profil, Darstellung und Sicherheit'
		},
		{
			href: '#mobil',
			number: '09',
			title: 'Mobil & Tastatur',
			description: 'Unterwegs und ohne Maus bedienen'
		},
		{
			href: '#dokumente',
			number: '10',
			title: 'Dokumente & Editor',
			description: 'Notizen veröffentlichen und Bibeltexte zitieren'
		},
		{
			href: '#predigten',
			number: '11',
			title: 'Predigtvorbereitung',
			description: 'Vorlagen, Board und Historie'
		},
		{
			href: '#import-export',
			number: '12',
			title: 'Import & Export',
			description: 'Markdown, ZIP, Word und PDF'
		},
		{
			href: '#probleme',
			number: '13',
			title: 'Häufige Fragen',
			description: 'Schnelle Hilfe bei Problemen'
		}
	];

	const shortcuts = [
		{ keys: ['Enter'], action: 'Eingabe im aktuellen Tab öffnen oder darin suchen' },
		{ keys: ['Esc'], action: 'Menü oder Notizansicht schließen' },
		{ keys: ['Strg', 'S'], action: 'Dokument sofort speichern (auf dem Mac: ⌘ + S)' },
		{ keys: ['Strg', 'M'], action: 'Zwischen visuellem Editor und Markdown wechseln' }
	];
</script>

<svelte:head>
	<meta
		name="description"
		content="Die vollständige Akribos-Anleitung: Bibel lesen, Notizen schreiben und veröffentlichen, Predigten vorbereiten sowie Markdown, Word und PDF austauschen."
	/>
</svelte:head>

<main class="help-page">
	<section class="kb-hero">
		<div class="kb-hero-inner">
			<p class="kb-eyebrow">Hilfe & Wissensbasis</p>
			<h1>Wie können wir dir helfen?</h1>
			<p class="kb-hero-copy">
				Von der ersten Bibelstelle bis zur Urtextanalyse: Hier findest du alle Funktionen von
				Akribos verständlich und Schritt für Schritt erklärt.
			</p>
			<div class="kb-hero-actions">
				<a class="kb-primary-action" href="#erste-schritte">Mit dem Schnellstart beginnen</a>
				<a class="kb-secondary-action" href="#themen">Alle Themen ansehen</a>
			</div>
		</div>
	</section>

	<div class="page-shell">
		<aside class="sidebar" aria-label="Inhaltsverzeichnis">
			<nav>
				<p class="sidebar-title">Auf dieser Seite</p>
				{#each chapters as chapter (chapter.href)}
					<a href={chapter.href}>{chapter.title}</a>
				{/each}
			</nav>
		</aside>

		<div class="content">
			<section id="themen" class="topic-overview" aria-labelledby="topics-title">
				<div class="section-heading compact-heading">
					<p class="kb-eyebrow">Themenübersicht</p>
					<h2 id="topics-title">Direkt zur passenden Anleitung</h2>
				</div>
				<div class="topic-grid">
					{#each chapters as chapter (chapter.href)}
						<a class="topic-card" href={chapter.href}>
							<span>{chapter.number}</span>
							<strong>{chapter.title}</strong>
							<small>{chapter.description}</small>
						</a>
					{/each}
				</div>
			</section>

			<section id="erste-schritte" class="knowledge-section">
				<div class="section-heading">
					<p class="eyebrow">01 · Erste Schritte</p>
					<h2>Dein Schnellstart mit Akribos</h2>
					<p>Zum Lesen brauchst du kein Konto. Drei Schritte genügen für den Einstieg.</p>
				</div>

				<ol class="steps">
					<li>
						<span class="step-number">1</span>
						<div>
							<strong>Stelle eingeben</strong>
							<p>
								Tippe zum Beispiel <code>Joh 3,16</code> in das Feld des gewünschten Tabs und drücke Enter.
							</p>
						</div>
					</li>
					<li>
						<span class="step-number">2</span>
						<div>
							<strong>Ressource als Tab öffnen</strong>
							<p>
								Klicke in einer Kachel auf <strong>+</strong>. Im Auswahlfenster kannst du eine
								Bibel, einen Kommentar, Parallelstellen oder ein Wörterbuch als weiteren Tab öffnen.
							</p>
						</div>
					</li>
					<li>
						<span class="step-number">3</span>
						<div>
							<strong>Text untersuchen</strong>
							<p>
								Klicke auf ein dezent unterstrichenes Wort für die Urtextinformationen oder auf eine
								Versnummer für weitere Werkzeuge.
							</p>
						</div>
					</li>
				</ol>

				<div class="callout tip">
					<strong>Was bringt ein Konto?</strong>
					<p>
						Lesen, suchen und Strong-Einträge nachschlagen funktioniert ohne Anmeldung. Ein
						kostenloses Konto brauchst du erst für persönliche Markierungen, Kommentare,
						Stellensammlungen und dauerhaft gespeicherte Einstellungen.
					</p>
					<a href="/register">Konto erstellen →</a>
				</div>
			</section>

			<section id="bibelstellen" class="knowledge-section">
				<div class="section-heading">
					<p class="eyebrow">02 · Bibelstellen finden</p>
					<h2>Eine Stelle direkt aufrufen</h2>
					<p>
						Das Feld eines Bibel- oder Kommentar-Tabs versteht Stellenangaben, Suchwörter und
						Strong-Nummern. Akribos erkennt automatisch, was du meinst, und zeigt Treffer nur aus
						diesem Werk direkt im Tab an, ohne den Reader zu verlassen. Das Feld eines
						Wörterbuch-Tabs springt stattdessen direkt zu dessen Strong-Nummer oder Stichwort.
					</p>
				</div>

				<div class="example-grid">
					<div class="example"><code>Joh 3,16</code><span>Ein einzelner Vers</span></div>
					<div class="example"><code>Joh3</code><span>Ein ganzes Kapitel</span></div>
					<div class="example"><code>Joh 3,16-18</code><span>Ein Versbereich</span></div>
					<div class="example"><code>1.Mose 1,1</code><span>Vollständiger Buchname</span></div>
					<div class="example"><code>1Mo1,1</code><span>Kurze Schreibweise</span></div>
					<div class="example"><code>Römer8,28</code><span>Auch ohne Leerzeichen</span></div>
				</div>

				<h3>Buchnamen suchen</h3>
				<p>
					Eine Stelle braucht im Tab-Feld immer eine Kapitelzahl, zum Beispiel <code>Jud 1</code>.
					Ein bloßer Buchname wie <code>Judas</code> wird dagegen im aktuellen Werk gesucht. Mit
					Anführungszeichen, etwa <code>"Judas"</code>, kannst du ausdrücklich nach genau diesem
					Wort oder einer Wortfolge suchen.
				</p>

				<h3>Zwischen Kapiteln wechseln</h3>
				<ul class="feature-list">
					<li>
						Beim Scrollen werden angrenzende Kapitel automatisch nachgeladen. Die Adresse und das
						Feld des fokussierten Tabs folgen der aktuell gelesenen Stelle.
					</li>
					<li>
						Nach der Anmeldung merkt sich Akribos deine letzte Lesestelle und setzt dort beim
						nächsten Besuch fort.
					</li>
				</ul>
			</section>

			<section id="reader" class="knowledge-section">
				<div class="section-heading">
					<p class="eyebrow">03 · Lesen & vergleichen</p>
					<h2>Der Reader im Überblick</h2>
					<p>
						Bis zu vier Kacheln teilen sich den Leseraum. Jede Kachel enthält beliebig viele
						Ressourcen als Tabs, sodass Bibeln und Kommentare versgenau zusammenarbeiten.
					</p>
				</div>

				<figure class="screenshot">
					<img
						src="/help/reader-overview.webp"
						alt="Akribos-Reader mit drei Kacheln, mehreren Ressourcen-Tabs und Tabgruppen"
						width="1440"
						height="900"
						loading="lazy"
					/>
					<figcaption>
						<strong>Der Reader:</strong> oben Navigation und Layoutwahl, in jeder Kachel eigene Tabs und
						Tabgruppen für die Synchronisierung.
					</figcaption>
				</figure>

				<div class="instruction-grid">
					<article>
						<span>Zwischen Tabs wechseln</span>
						<p>
							Klicke auf einen Tab, um ihn samt seiner eigenen Lesestelle sichtbar zu machen. Mit
							<strong class="inline-flex align-text-bottom"><Icon name="x" class="size-4" /></strong
							> schließt du ihn wieder; das Buchsymbol wechselt sein aktuelles Werk.
						</p>
					</article>
					<article>
						<span>Tab hinzufügen</span>
						<p>
							Mit <strong>+</strong> in einer Kachel ergänzt du eine Übersetzung, einen Kommentar, Parallelstellen
							oder ein Wörterbuch. Dieselbe Ressource darf auch mehrfach in derselben Kachel offen sein.
						</p>
					</article>
					<article>
						<span>Kacheln anordnen</span>
						<p>
							Über das dezente Layoutsymbol im Kopf stehen acht Anordnungen bereit: ein bis vier
							Spalten, zwei Zeilen, ein 2×2-Raster und zwei asymmetrische Dreier-Layouts.
						</p>
					</article>
					<article>
						<span>Größe verändern</span>
						<p>
							Ziehe die schmale Trennfläche zwischen Kacheln horizontal oder vertikal. Mit den
							Pfeiltasten lässt sie sich ebenfalls verschieben; die Größen werden je Layout
							gespeichert.
						</p>
					</article>
					<article>
						<span>Tabgruppe wechseln</span>
						<p>
							Wähle für einen Tab den Buchstaben <strong>A, B, C, D oder E</strong>. Alle gerade
							sichtbaren Tabs mit demselben Buchstaben folgen einander; inaktive Tabs derselben
							Gruppe merken sich die neue Stelle für ihr nächstes Öffnen. <strong>–</strong> scrollt unabhängig.
						</p>
					</article>
					<article>
						<span>Ansicht duplizieren</span>
						<p>
							Die Adresse enthält Layout, Tabs, Tabgruppen, deren Lesestellen und eine aktive Suche.
							Neuladen, Browser-Tab duplizieren oder Link kopieren öffnet daher dieselbe Ansicht.
							Ein fremder Link ersetzt nicht deinen gespeicherten Standard-Arbeitsbereich.
						</p>
					</article>
					<article>
						<span>Endlos weiterlesen</span>
						<p>
							Wenn du dich einem Kapitelende näherst, lädt Akribos automatisch weiter. Dasselbe gilt
							nach oben für das vorherige Kapitel.
						</p>
					</article>
					<article>
						<span>Werk-Informationen</span>
						<p>
							Das <strong>i</strong>-Symbol zeigt Titel, Copyright und Nutzungshinweise des
							aktuellen Werks, ohne dafür dauerhaft Platz unter dem Text zu belegen.
						</p>
					</article>
				</div>

				<div class="callout note">
					<strong>Zusammengefasste Verse</strong>
					<p>
						Manche Übersetzungen oder Kommentare fassen mehrere Verse zusammen. Akribos richtet
						solche Bereiche trotzdem am passenden Gegenstück in den gekoppelten Tabs aus.
					</p>
				</div>

				<h3>Textgröße und Farbschema</h3>
				<p>
					Mit <strong>A−</strong> und <strong>A+</strong> im Kopfbereich verkleinerst oder
					vergrößerst du den Bibeltext. Das Sonnensymbol beziehungsweise Mondsymbol wechselt
					zwischen heller und dunkler Darstellung. Angemeldete Nutzer finden dieselben Optionen
					unter <a href="/account?tab=appearance">Konto → Darstellung</a>.
				</p>
			</section>

			<section id="strong" class="knowledge-section">
				<div class="section-heading">
					<p class="eyebrow">04 · Strong & Urtext</p>
					<h2>Wörter im Urtext untersuchen</h2>
					<p>
						In dafür vorbereiteten Übersetzungen sind Wörter mit Strong-Nummern dezent
						unterstrichen. Ein Klick öffnet die Studienansicht in einem Wörterbuch-Tab derselben
						Tabgruppe.
					</p>
				</div>

				<h3>Was die Angaben bedeuten</h3>
				<dl class="definition-list">
					<div>
						<dt>Strong-Nummer</dt>
						<dd>
							Eine sprachunabhängige Kennung für eine hebräische oder griechische Grundform. <code
								>G</code
							>
							steht für Griechisch, <code>H</code> für Hebräisch.
						</dd>
					</div>
					<div>
						<dt>Grundform / Lemma</dt>
						<dd>
							Die Wörterbuchform des Wortes. Im Bibeltext kann das Wort durch Beugung anders
							aussehen.
						</dd>
					</div>
					<div>
						<dt>Umschrift & Aussprache</dt>
						<dd>
							Zeigen das Wort in lateinischen Buchstaben und geben eine Orientierung zur Aussprache.
						</dd>
					</div>
					<div>
						<dt>Grammatik</dt>
						<dd>
							Beschreibt die konkrete Form an dieser Stelle, zum Beispiel Wortart, Zeitform, Modus,
							Fall, Geschlecht und Zahl.
						</dd>
					</div>
					<div>
						<dt>Übersetzungen</dt>
						<dd>
							Zeigt, mit welchen deutschen Wörtern diese Grundform in der gewählten Bibel
							wiedergegeben wird. Kleine Gruppen werden übersichtlich zusammengefasst.
						</dd>
					</div>
					<div>
						<dt>Vorkommen</dt>
						<dd>
							Listet weitere Fundstellen und ihre Verteilung auf die biblischen Bücher. Ein Klick
							öffnet die Stelle im Kontext.
						</dd>
					</div>
				</dl>

				<h3>Strong-Nummer direkt öffnen</h3>
				<p>
					Gib etwa <code>G25</code> oder <code>H430</code> in das Feld eines Bibel-Tabs ein. Die Vorkommen
					aus genau dieser Übersetzung erscheinen samt Buchverteilung und Übersetzungsformen im Tab. Ein
					Klick auf ein markiertes Wort im Bibeltext öffnet oder aktualisiert stattdessen den Wörterbuch-Tab
					in der gleichen Tabgruppe. Dort stehen Definition, Grammatik, Übersetzungsformen und Fundstellen
					gemeinsam; ein kleines Kürzel neben dem Suchfeld zeigt die zugrunde liegende Übersetzung. Im
					Feld des Wörterbuch-Tabs kannst du nach Strong-Nummer, Lemma oder Umschrift zum nächsten Eintrag
					springen.
				</p>
			</section>

			<section id="suchen" class="knowledge-section">
				<div class="section-heading">
					<p class="eyebrow">05 · Im Bibeltext suchen</p>
					<h2>Im aktuellen Werk suchen</h2>
					<p>
						Alles, was keine Bibelstelle oder Strong-Nummer ist, wird im aktuellen Werk als
						Textsuche behandelt. Die Ergebnisliste ersetzt vorübergehend nur den Inhalt dieses Tabs;
						über × oder durch Öffnen eines Treffers kehrst du zum Lesetext zurück.
					</p>
				</div>

				<div class="search-syntax">
					<div>
						<code>liebe</code>
						<p>
							Findet passende Wortformen und Wörter mit diesem Anfang, etwa „Liebe“, „lieben“ und
							„liebt“.
						</p>
					</div>
					<div>
						<code>gnade wahrheit</code>
						<p>Findet Verse, in denen beide Begriffe vorkommen.</p>
					</div>
					<div>
						<code>"am Anfang"</code>
						<p>Sucht genau diese zusammenhängende Wortfolge.</p>
					</div>
					<div>
						<code>liebe -zorn</code>
						<p>Findet „liebe“, schließt Verse mit „zorn“ aber aus.</p>
					</div>
				</div>

				<p>
					Bei einer Bibel zeigen die Ergebnisse ausschließlich Verse dieser Übersetzung; bei einem
					Kommentar werden dessen eigene Einträge durchsucht. Treffer im Bibeltext werden
					hervorgehoben. Das Buchdiagramm über den Treffern schränkt die Liste auf ein Bibelbuch
					ein; ein zweiter Klick oder „Buchfilter aufheben“ entfernt die Einschränkung. Längere
					Trefferlisten lassen sich am unteren Rand des Tabs seitenweise durchblättern.
				</p>
				<div class="callout tip">
					<strong>Keine Treffer?</strong>
					<p>
						Prüfe die Schreibweise, entferne einzelne Suchwörter oder beginne mit einem kürzeren
						Wortanfang. Wenn Akribos eine ähnliche Schreibweise kennt, erscheint ein Vorschlag.
					</p>
				</div>
			</section>

			<section id="verse" class="knowledge-section">
				<div class="section-heading">
					<p class="eyebrow">06 · Mit Versen arbeiten</p>
					<h2>Das Versmenü</h2>
					<p>
						Klicke auf eine Versnummer. Beim ersten Vers eines Kapitels öffnet ein Klick auf die
						große Kapitelzahl dasselbe Menü.
					</p>
				</div>

				<figure class="screenshot screenshot-narrow">
					<img
						src="/help/verse-menu.webp"
						alt="Geöffnetes Versmenü mit Kopieren, Markierungsfarben, Notiz und Stellensammlungen"
						width="1440"
						height="900"
						loading="lazy"
					/>
					<figcaption>
						<strong>Versmenü:</strong> Alle Aktionen beziehen sich genau auf den angeklickten Vers und
						die jeweilige Übersetzung.
					</figcaption>
				</figure>

				<div class="instruction-grid">
					<article>
						<span>Nur diesen Vers zeigen</span>
						<p>
							Öffnet eine eindeutige Adresse zu dem Vers. Diese eignet sich auch als Lesezeichen.
						</p>
					</article>
					<article>
						<span>Text kopieren</span>
						<p>Kopiert Stellenangabe und Versinhalt gemeinsam in die Zwischenablage.</p>
					</article>
					<article>
						<span>Link kopieren</span>
						<p>Kopiert eine direkte Webadresse. Der Empfänger braucht zum Lesen kein Konto.</p>
					</article>
					<article>
						<span>Markieren</span>
						<p>
							Wähle einen Farbpunkt. Ein erneuter Klick auf die aktive Farbe entfernt die
							Markierung.
						</p>
					</article>
					<article>
						<span>Notiz hinzufügen</span>
						<p>
							Öffnet die rechte Notizspalte und verknüpft eine private Arbeitskopie mit dem Vers.
						</p>
					</article>
					<article>
						<span>In Liste speichern</span>
						<p>
							Schaltet den Vers in einer vorhandenen Liste ein oder aus. „Neue Liste mit diesem
							Vers“ erledigt beides in einem Schritt.
						</p>
					</article>
				</div>

				<h3>Eigene Markierungsfarben verwalten</h3>
				<p>
					Unter <a href="/account?tab=appearance">Konto → Darstellung</a> kannst du Farben benennen, neue
					Farben anlegen und zu jeder Farbe alle markierten Verse anzeigen. Die Namen helfen dir, ein
					eigenes System zu entwickeln, etwa „Verheißung“, „Frage“ oder „Gebet“.
				</p>

				<h3>Private Notizen neben dem Bibeltext</h3>
				<ol class="plain-steps">
					<li>Blende im Layout-Menü die <strong>Notizspalte</strong> ein.</li>
					<li>
						Ohne geöffnetes Dokument folgt die Spalte automatisch dem aktuell sichtbaren Vers. Du
						kannst dort sofort eine neue Notiz anlegen oder deine Bibliothek durchsuchen und
						filtern.
					</li>
					<li>
						Der Editor nutzt die ganze verfügbare Höhe und speichert automatisch. Den Trenner zur
						Reader-Fläche kannst du horizontal ziehen oder mit den Pfeiltasten bedienen.
					</li>
					<li>
						Bei Bereichen erscheint das Dokumentsymbol nur an Anfang und Ende; eine dezente
						gepunktete Unterstreichung zeigt alle dazwischenliegenden Verse an.
					</li>
				</ol>
				<p class="privacy-note">
					Dokumente und die Notizspalte sind privat. Kommentare innerhalb einer öffentlich
					freigegebenen Stellensammlung gehören dagegen zur Liste und können dort sichtbar sein.
				</p>
			</section>

			<section id="listen" class="knowledge-section">
				<div class="section-heading">
					<p class="eyebrow">07 · Stellensammlungen</p>
					<h2>Verse sammeln, kommentieren und teilen</h2>
					<p>
						Stellensammlungen eignen sich für Themenstudien, Predigtvorbereitung, Lesepläne oder
						persönliche Sammlungen.
					</p>
				</div>

				<h3>Eine Liste anlegen und füllen</h3>
				<ul class="feature-list">
					<li>
						Öffne <a href="/lists">Notizen & Predigten → Stellensammlungen</a>, gib einen Namen ein
						und wähle
						<strong>Neue Liste</strong>.
					</li>
					<li>
						Alternativ erstellst du die Liste direkt aus dem Versmenü; der erste Vers wird sofort
						hinzugefügt.
					</li>
					<li>
						Auf der Listenseite kannst du weitere Stellen wie <code>Röm 8,28</code> eintippen oder Verse
						wieder entfernen.
					</li>
					<li>
						Klicke auf eine Stellenangabe, um den Vers wieder im vollständigen Kapitelkontext zu
						lesen.
					</li>
					<li>
						Zu jedem Listeneintrag kannst du eine eigene Notiz speichern. Diese ist von privaten
						Reader-Kommentaren getrennt.
					</li>
				</ul>

				<h3>Eine Liste freigeben</h3>
				<ol class="plain-steps">
					<li>
						Öffne die gewünschte Liste und wähle im Bereich <strong>Teilen</strong> die Freigabe.
					</li>
					<li>Kopiere den angezeigten Link und versende ihn.</li>
					<li>
						Die öffentliche Ansicht funktioniert ohne Akribos-Konto und zeigt Verse sowie
						Listennotizen nur lesend an.
					</li>
					<li>
						Du kannst die Freigabe jederzeit wieder ausschalten; der bisherige Link ist dann nicht
						mehr öffentlich erreichbar.
					</li>
				</ol>
				<div class="callout warning">
					<strong>Vor dem Teilen prüfen</strong>
					<p>
						Listennotizen werden mit veröffentlicht. Private Kommentare aus dem Reader werden
						niemals automatisch in eine Liste übernommen.
					</p>
				</div>
			</section>

			<section id="konto" class="knowledge-section">
				<div class="section-heading">
					<p class="eyebrow">08 · Konto & Einstellungen</p>
					<h2>Persönliche Funktionen verwalten</h2>
					<p>
						Das Benutzermenü rechts oben führt zu Konto, Hilfe, An- beziehungsweise Abmeldung sowie
						den rechtlichen Seiten.
					</p>
				</div>

				<div class="account-grid">
					<article>
						<h3>Registrierung</h3>
						<p>
							Gib Anzeigenamen, E-Mail-Adresse und Passwort ein. Öffne anschließend den
							Bestätigungslink aus der E-Mail. Erst danach ist das Konto aktiv.
						</p>
						<a href="/register">Zur Registrierung →</a>
					</article>
					<article>
						<h3>Profil & Sicherheit</h3>
						<p>
							Ändere deinen Anzeigenamen oder dein Passwort unter „Profil & Sicherheit“. Die
							E-Mail-Adresse ist die feste Kennung deines Kontos.
						</p>
						<a href="/account">Kontoeinstellungen →</a>
					</article>
					<article>
						<h3>Passwort vergessen</h3>
						<p>
							Wähle auf der Anmeldeseite „Passwort vergessen“. Akribos sendet einen zeitlich
							begrenzten Link an deine hinterlegte Adresse.
						</p>
						<a href="/password-reset">Passwort zurücksetzen →</a>
					</article>
					<article>
						<h3>Darstellung</h3>
						<p>
							Verwalte Hell-/Dunkelmodus, Reader-Schriftgröße, deinen gespeicherten Arbeitsbereich
							und Markierungsfarben.
						</p>
						<a href="/account?tab=appearance">Darstellung öffnen →</a>
					</article>
				</div>

				<h3>API-Schlüssel für fortgeschrittene Nutzung</h3>
				<p>
					Unter „Profil & Sicherheit“ können angemeldete Nutzer API-Schlüssel erstellen. Ein
					öffentlicher Schlüssel darf öffentliche Daten lesen; ein persönlicher Schlüssel kann
					zusätzlich auf die eigenen Notizen und Markierungen zugreifen. Der vollständige Schlüssel
					wird nur einmal angezeigt: kopiere und bewahre ihn sicher auf. Nicht mehr benötigte
					Schlüssel solltest du widerrufen. Technische Beispiele findest du in der <a
						href="/api/docs">API-Dokumentation</a
					>.
				</p>
			</section>

			<section id="mobil" class="knowledge-section">
				<div class="section-heading">
					<p class="eyebrow">09 · Mobil & Tastatur</p>
					<h2>Akribos auf jedem Gerät bedienen</h2>
				</div>

				<h3>Auf Smartphone und Tablet</h3>
				<p>
					Auf schmalen Bildschirmen ist jeweils eine Reader-Kachel sichtbar. Die pillenförmigen
					Reiter oberhalb des Leseraums wechseln zwischen den Kacheln; innerhalb der Kachel bleibt
					die vollständige Tab-Leiste bedienbar. Das gespeicherte Desktop-Layout wird dabei nicht
					verändert.
				</p>

				<h3>Tastaturkürzel</h3>
				<div class="shortcut-table" role="table" aria-label="Tastaturkürzel">
					{#each shortcuts as shortcut (shortcut.action)}
						<div role="row">
							<span role="cell" class="keys"
								>{#each shortcut.keys as key (key)}<kbd>{key}</kbd>{/each}</span
							><span role="cell">{shortcut.action}</span>
						</div>
					{/each}
				</div>

				<h3>Barrierearme Bedienung</h3>
				<p>
					Alle wesentlichen Aktionen sind per Tastatur erreichbar. Menüs lassen sich mit den
					Pfeiltasten durchlaufen, Dialoge besitzen beschriftete Bedienelemente und das Farbschema
					unterstützt Hell- und Dunkelmodus. Für eine stärkere Vergrößerung kannst du zusätzlich die
					Zoomfunktion deines Browsers verwenden.
				</p>
			</section>

			<section id="dokumente" class="knowledge-section">
				<div class="section-heading">
					<p class="eyebrow">10 · Dokumente & Editor</p>
					<h2>Zwei klare Bereiche für Notizen und Predigten</h2>
					<p>
						Der Menüpunkt <a href="/notes">Dokumente</a> öffnet den Schreibbereich. Die kompakte
						Navigation unterscheidet nur <strong>Notizen</strong> und <strong>Predigten</strong>.
						Import und veröffentlichte Notizen stehen bei den Notizen, Vorlagen beim Predigt-Board.
					</p>
				</div>
				<h3>Suchen und ordnen</h3>
				<ul class="feature-list">
					<li>
						Die Volltextsuche findet Titel und Inhalt; weitere Filter grenzen Bibelstelle und
						Übersetzung ein.
					</li>
					<li>
						Schlagwörter bilden Bäume wie <code>Theologie/Gnade</code>. Elternfilter und die Zahl in
						Klammern schließen Nachfahren ein; Zweige lassen sich ein- und ausklappen.
					</li>
					<li>
						Eine Bereichssuche findet auch Dokumente, deren verknüpfte Bibelstelle die gesuchte
						Stelle nur überschneidet.
					</li>
				</ul>
				<h3>Visuell und in Markdown schreiben</h3>
				<p>
					Beide Modi bearbeiten dieselbe portable Markdown-Arbeitskopie. Autosave läuft seriell und
					warnt vor Konflikten. Gib im visuellen Editor beispielsweise <code>/bibel Mt 3,12</code>
					ein und drücke Enter: Akribos lädt den Text aus der gewählten Bibel und fügt ein Zitat mit Quellenzeile
					ein. Erkannte Stellen wie <code>Heb 12,15</code> sind automatisch verlinkt; ihr Hover- oder
					Fokus-Popup zeigt den Vers und bietet ebenfalls „Bibeltext einfügen“.
				</p>
				<h3>Notizen veröffentlichen</h3>
				<p>
					Nur Administratoren können eine eigene Notiz veröffentlichen. Dabei entsteht ein eigener
					Schnappschuss. Weitere Änderungen bleiben zunächst privat, bis „Veröffentlichung
					aktualisieren“ gewählt wird. Nicht gelistete Notizen fehlen bewusst in Index, Feed und
					Sitemap.
				</p>
			</section>

			<section id="predigten" class="knowledge-section">
				<div class="section-heading">
					<p class="eyebrow">11 · Predigtvorbereitung</p>
					<h2>Von der Vorlage bis zur Durchführung</h2>
					<p>
						Das Predigt-Board begleitet jede Arbeitskopie durch Idee, Recherche, Gliederung, Bereit
						und Gehalten.
					</p>
				</div>
				<ol class="plain-steps">
					<li>
						Erstelle unter <a href="/sermons/templates">Predigtvorlagen</a> beliebige private Markdown-Gliederungen
						oder nutze die Standardvorlage.
					</li>
					<li>Wähle beim Erstellen Titel, Bibelstelle, Reihe, lokalisiertes Datum und Vorlage.</li>
					<li>
						Ziehe die Karte auf dem Board in eine andere Spalte. Per Tastatur verschiebst du die
						fokussierte Karte mit <kbd>Alt</kbd> + Pfeil links oder rechts.
					</li>
					<li>
						Trage im Dokument unter „Bereits gehalten“ beliebig viele Kombinationen aus Datum und
						Ort ein. Der geplante Predigttermin bleibt davon unabhängig.
					</li>
				</ol>
				<p class="privacy-note">
					Vorlagen, Board-Daten und Durchführungshistorie gehören ausschließlich dem angemeldeten
					Konto.
				</p>
			</section>

			<section id="import-export" class="knowledge-section">
				<div class="section-heading">
					<p class="eyebrow">12 · Import & Export</p>
					<h2>Dokumente sicher austauschen</h2>
				</div>
				<h3>Obsidian und Markdown importieren</h3>
				<p>
					Wähle eine oder mehrere <code>.md</code>-Dateien oder genau ein ZIP-Archiv mit
					Markdown-Dateien. Eine gemeinsame Vorschau zeigt bereinigten Text, Typ, Schlagwörter und
					Bibelstellen. Erst die Bestätigung legt alle Dokumente atomar und immer privat an.
					ZIP-Pfade werden nicht ins Dateisystem entpackt; Traversal, symbolische Links,
					Verschlüsselung, unbekannte Kompression, mehr als 100 Markdown-Dateien sowie mehr als 16
					MiB gepackte oder relevante entpackte Daten werden abgewiesen.
				</p>
				<h3>Exportformate</h3>
				<ul class="feature-list">
					<li>
						<strong>Markdown:</strong> UTF-8-Text mit YAML-Frontmatter für Typ, Tags, Stellen und Predigtmetadaten.
					</li>
					<li>
						<strong>Word (.docx):</strong> bearbeitbares Dokument mit Überschrift, Metadaten und gegliedertem
						Inhalt.
					</li>
					<li>
						<strong>PDF:</strong> direkt lesbare A4-Ausgabe. Komplexe Markdown-Layoutdetails können vereinfacht
						erscheinen.
					</li>
				</ul>
				<p>Alle Exporte sind owner-only, werden nicht gecacht und verwenden sichere Dateinamen.</p>
			</section>

			<section id="probleme" class="knowledge-section faq-section">
				<div class="section-heading">
					<p class="eyebrow">13 · Häufige Fragen</p>
					<h2>Probleme schnell lösen</h2>
				</div>

				<details>
					<summary>Warum ist ein Wort nicht unterstrichen?</summary>
					<p>
						Nicht jede Übersetzung enthält Strong-Verknüpfungen. Wechsle zu einer entsprechend
						ausgezeichneten Bibelübersetzung. Auch dort können einzelne Wörter ohne Zuordnung
						bleiben.
					</p>
				</details>
				<details>
					<summary>Warum unterscheiden sich die Verszeilen zwischen zwei Übersetzungen?</summary>
					<p>
						Übersetzungen können Verse zusammenfassen, anders gliedern oder einzelne Versnummern
						auslassen. Akribos richtet den passenden Versbereich aus; die Textblöcke müssen deshalb
						nicht gleich hoch sein.
					</p>
				</details>
				<details>
					<summary>Meine Tabs bewegen sich nicht gemeinsam.</summary>
					<p>
						Prüfe die Buchstaben neben dem Kettensymbol. Sichtbare Tabs in derselben Tabgruppe A–E
						folgen einander; inaktive Tabs übernehmen die Stelle im Hintergrund. <strong>–</strong>
						bedeutet, dass der Tab unabhängig scrollt.
					</p>
				</details>
				<details>
					<summary>Eine Markierung oder Notiz ist nach der Anmeldung nicht zu sehen.</summary>
					<p>
						Prüfe, ob du dasselbe Konto verwendest. Übersetzungsspezifische Dokumentverknüpfungen
						erscheinen nur im passenden Werk; kanonische Verknüpfungen in allen Bibelübersetzungen.
					</p>
				</details>
				<details>
					<summary>Warum kann ich persönliche Funktionen nicht benutzen?</summary>
					<p>
						Markierungen, Dokumente und Listen benötigen ein angemeldetes, per E-Mail bestätigtes
						Konto. Melde dich an und lade die Seite bei Bedarf neu.
					</p>
				</details>
				<details>
					<summary>Was wird gespeichert?</summary>
					<p>
						Ohne Konto speichert Akribos notwendige Einstellungen wie Darstellung, Kachellayout,
						Tabs, Tabgruppen und letzte Lesestelle im Browser. Mit Konto werden persönliche Inhalte
						deinem Benutzerkonto zugeordnet. Details stehen in der <a href="/datenschutz"
							>Datenschutzerklärung</a
						>.
					</p>
				</details>
				<details>
					<summary>Woher stammen Bibeltexte und Wörterbücher?</summary>
					<p>
						Jede Ressource trägt ihren eigenen Rechte- und Quellenhinweis hinter dem Info-Symbol
						ihrer Tab-Leiste. Akribos vermischt mehrere Lexika zu derselben Strong-Nummer nicht.
					</p>
				</details>

				<div class="closing-card">
					<div>
						<p class="kb-eyebrow">Bereit?</p>
						<h2>Öffne eine Bibelstelle und probiere es aus.</h2>
						<p>Die meisten Funktionen erklären sich am schnellsten direkt im Reader.</p>
					</div>
					<a class="kb-primary-action" href="/Joh3,16">Johannes 3,16 öffnen</a>
				</div>
			</section>
		</div>
	</div>
</main>

<style>
	.help-page {
		--help-border: color-mix(in oklab, var(--color-stone-300) 65%, transparent);
		color: var(--color-stone-800);
	}
	:global(.dark) .help-page {
		--help-border: rgb(255 255 255 / 0.11);
		color: var(--color-stone-200);
	}
	.kb-hero {
		border-bottom: 1px solid var(--help-border);
		background:
			radial-gradient(
				circle at 78% 20%,
				color-mix(in oklab, var(--color-accent-500) 16%, transparent),
				transparent 35%
			),
			linear-gradient(
				145deg,
				color-mix(in oklab, var(--color-accent-500) 8%, var(--surface)) 0%,
				var(--surface) 58%
			);
	}
	.kb-hero-inner {
		max-width: 64rem;
		margin: 0 auto;
		padding: 5.5rem 1.5rem 5rem;
		text-align: center;
	}
	.kb-eyebrow {
		margin: 0 0 0.75rem;
		color: var(--color-accent-700);
		font-size: 0.72rem;
		font-weight: 750;
		letter-spacing: 0.13em;
		text-transform: uppercase;
	}
	:global(.dark) .kb-eyebrow {
		color: var(--color-accent-300);
	}
	.kb-hero h1 {
		margin: 0;
		color: var(--color-stone-950);
		font-size: clamp(2.25rem, 6vw, 4.5rem);
		font-weight: 680;
		letter-spacing: -0.045em;
		line-height: 1.03;
	}
	:global(.dark) .kb-hero h1 {
		color: white;
	}
	.kb-hero-copy {
		max-width: 45rem;
		margin: 1.35rem auto 0;
		color: var(--color-stone-600);
		font-size: clamp(1rem, 2vw, 1.2rem);
		line-height: 1.7;
	}
	:global(.dark) .kb-hero-copy {
		color: var(--color-stone-300);
	}
	.kb-hero-actions {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 0.75rem;
		margin-top: 2rem;
	}
	.kb-primary-action,
	.kb-secondary-action {
		display: inline-flex;
		min-height: 2.75rem;
		align-items: center;
		justify-content: center;
		border-radius: 0.65rem;
		padding: 0.7rem 1.05rem;
		font-size: 0.875rem;
		font-weight: 700;
		text-decoration: none;
	}
	.kb-primary-action {
		background: var(--color-accent-600);
		color: white;
		box-shadow: 0 7px 20px color-mix(in oklab, var(--color-accent-700) 24%, transparent);
	}
	.kb-primary-action:hover {
		background: var(--color-accent-700);
	}
	.kb-secondary-action {
		border: 1px solid var(--help-border);
		background: var(--surface-raised);
		color: var(--color-stone-700);
	}
	:global(.dark) .kb-secondary-action {
		color: var(--color-stone-200);
	}
	.page-shell {
		display: grid;
		max-width: 82rem;
		margin: 0 auto;
		grid-template-columns: 13.5rem minmax(0, 1fr);
		gap: 4rem;
		padding: 3.5rem 1.5rem 7rem;
	}
	.sidebar {
		position: relative;
	}
	.sidebar nav {
		position: sticky;
		top: calc(var(--header-height) + 1.5rem);
		border-left: 1px solid var(--help-border);
		padding-left: 1rem;
	}
	.sidebar-title {
		margin: 0 0 0.65rem;
		color: var(--color-stone-900);
		font-size: 0.72rem;
		font-weight: 750;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}
	:global(.dark) .sidebar-title {
		color: var(--color-stone-100);
	}
	.sidebar a {
		display: block;
		border-radius: 0.3rem;
		padding: 0.33rem 0.45rem;
		color: var(--color-stone-500);
		font-size: 0.77rem;
		text-decoration: none;
	}
	.sidebar a:hover {
		background: color-mix(in oklab, var(--color-accent-500) 9%, transparent);
		color: var(--color-accent-700);
	}
	.content {
		min-width: 0;
		max-width: 58rem;
	}
	.topic-overview {
		scroll-margin-top: calc(var(--header-height) + 1rem);
	}
	.section-heading {
		margin-bottom: 2rem;
	}
	.section-heading h2,
	.closing-card h2 {
		margin: 0;
		color: var(--color-stone-950);
		font-size: clamp(1.7rem, 4vw, 2.3rem);
		font-weight: 680;
		letter-spacing: -0.035em;
		line-height: 1.15;
	}
	:global(.dark) .section-heading h2,
	:global(.dark) .closing-card h2 {
		color: var(--color-stone-50);
	}
	.section-heading > p:last-child {
		max-width: 48rem;
		margin: 0.75rem 0 0;
		color: var(--color-stone-600);
		font-size: 1.02rem;
		line-height: 1.7;
	}
	:global(.dark) .section-heading > p:last-child {
		color: var(--color-stone-400);
	}
	.compact-heading {
		margin-bottom: 1.25rem;
	}
	.compact-heading h2 {
		font-size: 1.5rem;
	}
	.topic-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.75rem;
	}
	.topic-card {
		display: grid;
		grid-template-columns: 2rem 1fr;
		gap: 0.12rem 0.65rem;
		border: 1px solid var(--help-border);
		border-radius: 0.8rem;
		background: var(--surface-raised);
		padding: 1rem;
		color: inherit;
		text-decoration: none;
		transition:
			border-color 120ms ease,
			transform 120ms ease,
			box-shadow 120ms ease;
	}
	.topic-card:hover {
		border-color: color-mix(in oklab, var(--color-accent-500) 55%, var(--help-border));
		transform: translateY(-1px);
		box-shadow: 0 8px 22px rgb(28 25 23 / 0.07);
	}
	.topic-card > span {
		grid-row: 1 / span 2;
		color: var(--color-accent-600);
		font-size: 0.72rem;
		font-weight: 750;
	}
	.topic-card strong {
		color: var(--color-stone-900);
		font-size: 0.91rem;
	}
	:global(.dark) .topic-card strong {
		color: var(--color-stone-100);
	}
	.topic-card small {
		color: var(--color-stone-500);
		font-size: 0.75rem;
	}
	.knowledge-section {
		scroll-margin-top: calc(var(--header-height) + 1rem);
		border-top: 1px solid var(--help-border);
		margin-top: 4.5rem;
		padding-top: 4.5rem;
	}
	.knowledge-section h3 {
		margin: 2.4rem 0 0.65rem;
		color: var(--color-stone-900);
		font-size: 1.14rem;
		font-weight: 700;
		letter-spacing: -0.015em;
	}
	:global(.dark) .knowledge-section h3 {
		color: var(--color-stone-100);
	}
	.knowledge-section > p,
	.knowledge-section li {
		line-height: 1.72;
	}
	.knowledge-section a:not(.kb-primary-action) {
		color: var(--color-accent-700);
		text-decoration: underline;
		text-decoration-color: color-mix(in oklab, var(--color-accent-500) 35%, transparent);
		text-underline-offset: 2px;
	}
	:global(.dark) .knowledge-section a:not(.kb-primary-action) {
		color: var(--color-accent-300);
	}
	code,
	kbd {
		border: 1px solid var(--help-border);
		border-radius: 0.3rem;
		background: color-mix(in oklab, var(--color-stone-100) 75%, transparent);
		padding: 0.1rem 0.35rem;
		font-size: 0.87em;
	}
	:global(.dark) code,
	:global(.dark) kbd {
		background: rgb(255 255 255 / 0.06);
	}
	.steps {
		display: grid;
		gap: 1rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.steps li {
		display: grid;
		grid-template-columns: 2.6rem 1fr;
		gap: 0.9rem;
		align-items: start;
	}
	.step-number {
		display: flex;
		width: 2.6rem;
		height: 2.6rem;
		align-items: center;
		justify-content: center;
		border-radius: 50%;
		background: color-mix(in oklab, var(--color-accent-500) 13%, var(--surface));
		color: var(--color-accent-700);
		font-size: 0.85rem;
		font-weight: 750;
	}
	.steps strong {
		display: block;
		color: var(--color-stone-900);
	}
	:global(.dark) .steps strong {
		color: var(--color-stone-100);
	}
	.steps p {
		margin: 0.18rem 0 0;
		color: var(--color-stone-600);
		font-size: 0.9rem;
	}
	:global(.dark) .steps p {
		color: var(--color-stone-400);
	}
	.callout {
		margin: 2rem 0;
		border: 1px solid var(--help-border);
		border-left-width: 3px;
		border-radius: 0.7rem;
		background: var(--surface-raised);
		padding: 1rem 1.15rem;
	}
	.callout.tip {
		border-left-color: var(--color-accent-500);
	}
	.callout.note {
		border-left-color: #3b82f6;
	}
	.callout.warning {
		border-left-color: #d97706;
	}
	.callout strong {
		color: var(--color-stone-900);
		font-size: 0.9rem;
	}
	:global(.dark) .callout strong {
		color: var(--color-stone-100);
	}
	.callout p {
		margin: 0.3rem 0 0;
		color: var(--color-stone-600);
		font-size: 0.87rem;
		line-height: 1.65;
	}
	:global(.dark) .callout p {
		color: var(--color-stone-400);
	}
	.callout a {
		display: inline-block;
		margin-top: 0.5rem;
		font-size: 0.85rem;
		font-weight: 650;
	}
	.example-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.6rem;
	}
	.example {
		display: flex;
		align-items: center;
		gap: 0.7rem;
		border: 1px solid var(--help-border);
		border-radius: 0.6rem;
		padding: 0.7rem 0.8rem;
	}
	.example code {
		flex: 0 0 auto;
		color: var(--color-accent-700);
		font-weight: 700;
	}
	.example span {
		color: var(--color-stone-500);
		font-size: 0.8rem;
	}
	.feature-list {
		margin: 0.5rem 0 0;
		padding-left: 1.25rem;
	}
	.feature-list li {
		margin: 0.38rem 0;
		padding-left: 0.25rem;
	}
	.screenshot {
		overflow: hidden;
		margin: 2rem 0 2.5rem;
		border: 1px solid var(--help-border);
		border-radius: 0.9rem;
		background: var(--surface-raised);
		box-shadow: 0 20px 50px rgb(28 25 23 / 0.1);
	}
	.screenshot img {
		display: block;
		width: 100%;
		height: auto;
		border-bottom: 1px solid var(--help-border);
	}
	.screenshot figcaption {
		padding: 0.8rem 1rem;
		color: var(--color-stone-500);
		font-size: 0.76rem;
		line-height: 1.5;
	}
	.screenshot figcaption strong {
		color: var(--color-stone-700);
	}
	:global(.dark) .screenshot figcaption strong {
		color: var(--color-stone-300);
	}
	.instruction-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.75rem;
	}
	.instruction-grid article {
		border: 1px solid var(--help-border);
		border-radius: 0.7rem;
		padding: 1rem;
	}
	.instruction-grid article span {
		display: block;
		margin-bottom: 0.3rem;
		color: var(--color-stone-900);
		font-size: 0.88rem;
		font-weight: 700;
	}
	:global(.dark) .instruction-grid article span {
		color: var(--color-stone-100);
	}
	.instruction-grid article p {
		margin: 0;
		color: var(--color-stone-500);
		font-size: 0.8rem;
		line-height: 1.6;
	}
	.definition-list {
		display: grid;
		gap: 0;
		border: 1px solid var(--help-border);
		border-radius: 0.8rem;
	}
	.definition-list div {
		display: grid;
		grid-template-columns: 10rem 1fr;
		gap: 1rem;
		padding: 0.85rem 1rem;
	}
	.definition-list div + div {
		border-top: 1px solid var(--help-border);
	}
	.definition-list dt {
		color: var(--color-stone-900);
		font-size: 0.85rem;
		font-weight: 700;
	}
	:global(.dark) .definition-list dt {
		color: var(--color-stone-100);
	}
	.definition-list dd {
		margin: 0;
		color: var(--color-stone-600);
		font-size: 0.83rem;
		line-height: 1.6;
	}
	:global(.dark) .definition-list dd {
		color: var(--color-stone-400);
	}
	.search-syntax {
		display: grid;
		gap: 0.65rem;
	}
	.search-syntax > div {
		display: grid;
		grid-template-columns: 9rem 1fr;
		align-items: baseline;
		border-bottom: 1px solid var(--help-border);
		padding: 0.7rem 0;
	}
	.search-syntax code {
		width: max-content;
		color: var(--color-accent-700);
		font-weight: 700;
	}
	.search-syntax p {
		margin: 0;
		color: var(--color-stone-600);
		font-size: 0.88rem;
		line-height: 1.6;
	}
	:global(.dark) .search-syntax p {
		color: var(--color-stone-400);
	}
	.plain-steps {
		padding-left: 1.35rem;
	}
	.plain-steps li {
		margin: 0.45rem 0;
		padding-left: 0.3rem;
	}
	.privacy-note {
		border-radius: 0.6rem;
		background: color-mix(in oklab, var(--color-accent-500) 8%, transparent);
		padding: 0.85rem 1rem;
		color: var(--color-stone-600);
		font-size: 0.85rem;
	}
	:global(.dark) .privacy-note {
		color: var(--color-stone-300);
	}
	.account-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.75rem;
	}
	.account-grid article {
		border: 1px solid var(--help-border);
		border-radius: 0.75rem;
		padding: 1rem;
	}
	.account-grid h3 {
		margin: 0 0 0.35rem;
		font-size: 0.95rem;
	}
	.account-grid p {
		margin: 0;
		color: var(--color-stone-500);
		font-size: 0.81rem;
		line-height: 1.6;
	}
	.account-grid a {
		display: inline-block;
		margin-top: 0.65rem;
		font-size: 0.8rem;
		font-weight: 650;
	}
	.shortcut-table {
		overflow: hidden;
		border: 1px solid var(--help-border);
		border-radius: 0.7rem;
	}
	.shortcut-table [role='row'] {
		display: grid;
		grid-template-columns: 13rem 1fr;
		align-items: center;
		padding: 0.7rem 1rem;
		font-size: 0.84rem;
	}
	.shortcut-table [role='row'] + [role='row'] {
		border-top: 1px solid var(--help-border);
	}
	.keys {
		display: flex;
		gap: 0.3rem;
	}
	.keys kbd {
		min-width: 1.8rem;
		text-align: center;
	}
	.faq-section details {
		border-top: 1px solid var(--help-border);
	}
	.faq-section details:last-of-type {
		border-bottom: 1px solid var(--help-border);
	}
	.faq-section summary {
		cursor: pointer;
		padding: 1rem 0.2rem;
		color: var(--color-stone-900);
		font-size: 0.92rem;
		font-weight: 680;
	}
	:global(.dark) .faq-section summary {
		color: var(--color-stone-100);
	}
	.faq-section details p {
		margin: -0.25rem 0 1.15rem;
		padding-right: 2rem;
		color: var(--color-stone-600);
		font-size: 0.86rem;
		line-height: 1.65;
	}
	:global(.dark) .faq-section details p {
		color: var(--color-stone-400);
	}
	.closing-card {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 2rem;
		margin-top: 3rem;
		border-radius: 1rem;
		background: color-mix(in oklab, var(--color-accent-500) 10%, var(--surface-raised));
		padding: 2rem;
	}
	.closing-card h2 {
		max-width: 33rem;
		font-size: 1.55rem;
	}
	.closing-card p:not(.kb-eyebrow) {
		margin: 0.5rem 0 0;
		color: var(--color-stone-500);
		font-size: 0.86rem;
	}
	.closing-card .kb-primary-action {
		flex: 0 0 auto;
	}
	@media (max-width: 900px) {
		.page-shell {
			display: block;
			padding-top: 2.5rem;
		}
		.sidebar {
			display: none;
		}
		.content {
			max-width: none;
		}
	}
	@media (max-width: 640px) {
		.kb-hero-inner {
			padding: 4rem 1rem 3.75rem;
		}
		.page-shell {
			padding: 2rem 1rem 5rem;
		}
		.topic-grid,
		.instruction-grid,
		.account-grid,
		.example-grid {
			grid-template-columns: 1fr;
		}
		.knowledge-section {
			margin-top: 3.5rem;
			padding-top: 3.5rem;
		}
		.definition-list div,
		.search-syntax > div {
			grid-template-columns: 1fr;
			gap: 0.35rem;
		}
		.shortcut-table [role='row'] {
			grid-template-columns: 8rem 1fr;
			padding: 0.7rem 0.75rem;
		}
		.closing-card {
			display: block;
			padding: 1.4rem;
		}
		.closing-card .kb-primary-action {
			margin-top: 1.2rem;
		}
	}
</style>
