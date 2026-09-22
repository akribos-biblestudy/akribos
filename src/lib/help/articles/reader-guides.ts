import type { HelpArticle } from '../types';

/** Task guides checked against the current reader and account interfaces. */
export const readerGuides: HelpArticle[] = [
	{
		id: 'finden-und-weiterlesen',
		topic: 'bibelstellen',
		path: '/help/bibelstellen/finden-und-weiterlesen',
		title: 'Bibelstellen öffnen und im Text weitergehen',
		description:
			'Springe zu einem Kapitel oder Vers, folge Querverweisen und finde mit dem Verlauf deines Tabs zur vorherigen Stelle zurück.',
		icon: 'map-pin',
		audience: 'user',
		level: 'guide',
		keywords: [
			'Bibelstelle',
			'Kapitel',
			'Vers',
			'Navigation',
			'Verlauf',
			'Zurück',
			'Vor',
			'Querverweis',
			'Fußnote',
			'Leseposition'
		],
		prerequisite: 'Ein geöffneter Bibel-Tab. Eine Anmeldung ist zum Lesen nicht erforderlich.',
		sections: [
			{
				id: 'schnellstart',
				title: 'In drei Schritten zur gesuchten Stelle',
				html: `<ol><li>Öffne <a href="/Joh1">den Reader</a> und wähle den Tab deiner Bibel.</li><li>Ersetze den Inhalt des Stellen- und Suchfelds unter dem Tabnamen durch <code>Joh 3,16</code>.</li><li>Bestätige mit <kbd>Enter</kbd>. Du liest jetzt Johannes 3,16 in der gewählten Übersetzung.</li></ol><p>Das Feld gehört zu genau diesem Tab. Tabs derselben <a href="/help/reader/werke-tabs-und-layouts#gruppen">Tabgruppe</a> folgen seiner Lesestelle.</p>`,
				screenshot: {
					src: '/help/live/reader-toolbar.webp',
					width: 457,
					height: 44,
					alt: 'Werkzeugleiste eines Bibel-Tabs mit Verlaufspfeilen, Werkauswahl, Stellenfeld Joh 3,16, Tabgruppe A und Werk-Informationen.',
					caption:
						'Gib die Stelle im Feld des gewünschten Tabs ein. Links liegen seine Verlaufspfeile, rechts Tabgruppe und Werk-Informationen.'
				}
			},
			{
				id: 'schreibweisen',
				title: 'Kapitel, Verse und Versbereiche eingeben',
				html: `<p>Du kannst deutsche Buchnamen oder die gebräuchlichen Kürzel verwenden. Groß- und Kleinschreibung sowie Leerzeichen sind bei Stellenangaben nicht entscheidend.</p><table><thead><tr><th>Eingabe</th><th>Ziel</th></tr></thead><tbody><tr><td><code>Joh 3</code></td><td>Johannes, Kapitel 3</td></tr><tr><td><code>Johannes 3,16</code></td><td>Johannes 3, Vers 16</td></tr><tr><td><code>Joh 3:16</code></td><td>Dieselbe Stelle mit Doppelpunkt</td></tr><tr><td><code>Joh 3,16-18</code></td><td>Die Verse 16 bis 18 dieses Kapitels</td></tr><tr><td><code>1. Mose 1,1</code></td><td>1. Mose 1, Vers 1</td></tr><tr><td><code>1Mo1,1</code></td><td>Dieselbe Stelle in Kurzform</td></tr><tr><td><code>Hohes Lied 2,1</code></td><td>Hohes Lied 2, Vers 1</td></tr></tbody></table><p>Für den direkten Sprung gibst du immer eine Kapitelzahl an. <code>Judas 1</code> öffnet das Kapitel; <code>Judas</code> allein sucht das Wort im geöffneten Werk. Versbereiche im Stellenfeld bleiben innerhalb eines Kapitels. Für eine Passage über eine Kapitelgrenze hinweg beginne am ersten Vers und lies weiter.</p><p>Die hier gezeigte Schreibweise betrifft das Feld im Reader. In einer Notiz kannst du auch längere, kapitelübergreifende <a href="/help/dokumente">Bibelstellen mit dem Dokument verknüpfen</a>.</p>`
			},
			{
				id: 'weiterlesen',
				title: 'Über Kapitelgrenzen hinweg lesen',
				html: `<p>Scrolle in der Kachel, deren Text du lesen möchtest. Am oberen und unteren Rand lädt Akribos benachbarte Kapitel nach. Du musst keinen Kapitelwechsel auslösen. Die Stelle im Feld folgt deinem Lesefortschritt.</p><p>Für einen gezielten Sprung zum Kapitelanfang gibst du das Kapitel ohne Vers ein, etwa <code>Joh 4</code>. Für den Wechsel zu einem anderen Buch gibst du dessen Namen und Kapitel ein. Ein getrennter Buch-/Kapitel-Auswahldialog ist dafür nicht nötig.</p><p>Mit dem <strong>Akribos-Logo</strong> gelangst du von anderen Seiten zurück zum Reader. Bei angemeldeten Nutzern berücksichtigt der Einstieg die zuletzt gemerkte Lesestelle dieses Browsers. Ohne gemerkte Stelle beginnt der Reader bei Johannes 1. Für eine gezielt benannte Studienansicht verwendest du <a href="/help/reader/arbeitsbereich-einrichten">Arbeitsbereiche</a>.</p>`
			},
			{
				id: 'verlauf',
				title: 'Mit Zurück und Vor zu früheren Schritten wechseln',
				html: `<ol><li>Öffne im selben Tab nacheinander zum Beispiel <code>Joh 1,1</code> und <code>Joh 3,16</code>.</li><li>Wähle den Pfeil <strong>Zurück</strong> links neben dem Stellenfeld. Der Tab kehrt zum vorherigen Schritt zurück.</li><li>Mit <strong>Vor</strong> gelangst du wieder zum jüngeren Schritt.</li></ol><p>Jeder Tab hat einen eigenen Verlauf. Darin erscheinen eingegebene Stellen, Suchansichten mit Buchfilter und Ergebnisseite sowie Lexikon-Eingaben. Beim fortlaufenden Scrollen entstehen keine langen Reihen aus einzelnen Versschritten. Öffnest du nach dem Zurückgehen ein neues Ziel, beginnt von dort ein neuer Weg; der bisherige Vorwärtsweg entfällt.</p><p>Die Pfeile sind ausgegraut, wenn in dieser Richtung kein Schritt verfügbar ist. Dieser Verlauf gehört zur laufenden Reader-Sitzung. Er ist kein gespeichertes Lesezeichen und wird nicht mit einem Link oder zwischen Geräten übertragen. Beim Schließen eines Tabs oder beim Ersetzen seines Werks beginnt dessen Verlauf neu.</p>`
			},
			{
				id: 'verweise',
				title: 'Querverweise und Fußnoten nutzen',
				html: `<p>Kommentare, Lexika und Parallelstellen enthalten anklickbare Bibelstellen. Fahre am Computer mit dem Zeiger darüber oder fokussiere einen solchen Link mit der Tastatur, um eine Bibelvorschau zu lesen. Ein normaler Klick öffnet die Stelle im Zusammenhang deines Arbeitsbereichs.</p><p>Für eine bestimmte Zielgruppe öffnest du per Rechtsklick auf die Bibelstelle das Menü <strong>Bibelstelle öffnen oder kopieren</strong>. Wähle dort <strong>In Tabgruppe A öffnen</strong> beziehungsweise eine andere Gruppe. So kannst du einen Verweis in einem Vergleichsbereich nachschlagen. Dasselbe Menü bietet <strong>Vers kopieren</strong>, bei einer Kapitelangabe <strong>Kapitel kopieren</strong>.</p><p>Eine kleine hochgestellte Fußnotenmarke öffnet den Hinweis des Werks. Ein erneuter Klick auf die Marke, ein Klick außerhalb oder <kbd>Escape</kbd> schließt ihn. Die Fußnote gehört zur jeweiligen Ausgabe; andere Übersetzungen können andere Hinweise enthalten.</p>`
			},
			{
				id: 'fragen',
				title: 'Wenn die erwartete Stelle nicht erscheint',
				html: `<details><summary>Statt eines Kapitels sehe ich Suchergebnisse.</summary><p>Prüfe, ob die Eingabe eine Kapitelzahl enthält und der Buchname erkannt werden kann. Verwende zum Beispiel „Joh 3“ statt „Johannes“. Eine Wortgruppe in Anführungszeichen ist eine Textsuche.</p></details><details><summary>Ein anderes Werk springt ebenfalls zur neuen Stelle.</summary><p>Beide Tabs gehören derselben Gruppe A–E an. Das ist für paralleles Lesen vorgesehen. Wähle für einen unabhängigen Tab „Keine“ im Menü „Tabgruppe wechseln“.</p></details><details><summary>Das Kapitel ist leer oder ein Vers fehlt.</summary><p>Nicht jedes Werk deckt alle Bücher und Kapitel ab. Kommentare können nur ausgewählte Abschnitte behandeln; Bibelausgaben können unterschiedliche Verszählungen enthalten. Prüfe das gewählte Werk und öffne bei Bedarf eine andere Bibel.</p></details><details><summary>Ich suche den Verlauf eines zuvor geschlossenen Tabs.</summary><p>Der Tab-Verlauf wird nicht dauerhaft gespeichert. Stelle die gewünschte Stelle über das Eingabefeld wieder her. Wiederkehrende Studienansichten kannst du als benannte Arbeitsbereiche ablegen.</p></details>`
			}
		]
	},
	{
		id: 'werke-tabs-und-layouts',
		topic: 'reader',
		path: '/help/reader/werke-tabs-und-layouts',
		title: 'Werke, Tabs und Kacheln passend anordnen',
		description:
			'Vergleiche Bibeln und Kommentare, wähle aus acht Anordnungen und bestimme, welche Tabs gemeinsam oder unabhängig lesen.',
		icon: 'layout',
		audience: 'user',
		level: 'guide',
		keywords: [
			'Werke',
			'Ressourcen',
			'Tabs',
			'Kacheln',
			'Layout',
			'Spalten',
			'Zeilen',
			'Tabgruppe',
			'Synchronisieren',
			'Verschieben',
			'Schließen',
			'Lizenz'
		],
		prerequisite:
			'Der Reader ist geöffnet. Anordnung und Werkauswahl sind auch ohne Anmeldung nutzbar.',
		sections: [
			{
				id: 'schnellstart',
				title: 'Bibel und Kommentar nebeneinander öffnen',
				html: `<ol><li>Öffne oben im Reader <strong>Kachelanordnung</strong> und wähle <strong>Zwei Spalten</strong>.</li><li>Wähle in der ersten Kachel den Tab deiner Bibel.</li><li>Öffne über das <strong>Pluszeichen</strong> der zweiten Kachel die Auswahl <strong>Werk wählen</strong>. Wähle dort einen Kommentar.</li><li>Öffne in beiden Tabs <strong>Tabgruppe wechseln</strong> und wähle jeweils <strong>A</strong>.</li><li>Gib im Bibel-Tab <code>Joh 1</code> ein. Beim Lesen folgt der Kommentar der gemeinsamen Stelle.</li></ol><p>Bereits offene Werke bleiben erhalten. Du kannst in einer Kachel jederzeit über die Tabnamen zwischen ihnen wechseln.</p>`,
				screenshot: {
					src: '/help/live/workspace-overview.webp',
					width: 1440,
					height: 1000,
					alt: 'Studienansicht mit Bibel, Kommentar und Lexikon in drei nebeneinander angeordneten Kacheln.',
					caption:
						'Jede Kachel zeigt einen aktiven Tab. Weitere Tabs bleiben in ihrer Tab-Leiste erreichbar.'
				}
			},
			{
				id: 'begriffe',
				title: 'Werk, Tab und Kachel unterscheiden',
				html: `<dl class="definition-list"><div><dt>Werk</dt><dd>Eine bestimmte Bibelübersetzung, ein Kommentar, ein Lexikon oder ein Parallelstellenwerk.</dd></div><div><dt>Tab</dt><dd>Ein geöffnetes Werk mit eigener Stelle, Suche und Tabgruppe. Dasselbe Werk kann in mehreren Tabs geöffnet sein.</dd></div><div><dt>Kachel</dt><dd>Ein sichtbarer Bereich des Readers. Eine Kachel kann mehrere Tabs enthalten und zeigt jeweils den ausgewählten.</dd></div><div><dt>Arbeitsbereich</dt><dd>Die gesamte Zusammenstellung mit Anordnung, geöffneten Tabs und Studienstand. Angemeldet kannst du mehrere benannte Arbeitsbereiche verwenden.</dd></div></dl><p>Für zwei Stellen in derselben Bibel öffnest du die Bibel zweimal und setzt mindestens einen der Tabs auf eine andere Tabgruppe oder auf <strong>Keine</strong>.</p>`
			},
			{
				id: 'auswahl',
				title: 'Ein Werk hinzufügen oder ersetzen',
				html: `<h3>Zusätzlichen Tab öffnen</h3><p>Das <strong>Pluszeichen</strong> in der Tab-Leiste öffnet die Werkauswahl. Die Auswahl ergänzt einen neuen Tab in dieser Kachel. Dein bisheriges Werk bleibt geöffnet.</p><h3>Das Werk eines Tabs wechseln</h3><p>Wähle unter der Tab-Leiste das Werksymbol mit dem kleinen Pfeil, dessen Hinweis <strong>Werk wechseln</strong> lautet. Die Auswahl ersetzt das Werk dieses Tabs. Nutze das Pluszeichen, wenn du beide behalten möchtest.</p><h3>Das gewünschte Werk finden</h3><p>Die Kategorien heißen <strong>Bibeln</strong>, <strong>Kommentare</strong>, <strong>Parallelstellen</strong> und <strong>Lexika</strong>, sofern Werke dieser Art vorhanden sind. Im Feld <strong>Werk suchen…</strong> suchst du nach Titel oder Kurzbezeichnung über die Kategorien hinweg. Ein Kategorienwechsel leert die Suche.</p><p>Die Auswahl enthält nur aktuell verfügbare Werke. Ein privates Werk erscheint nur mit entsprechender Freigabe für dein Konto. Ein geteilter Arbeitsbereich-Link gibt dir keine zusätzliche Leseberechtigung.</p>`,
				screenshot: {
					src: '/help/live/resource-picker.webp',
					width: 368,
					height: 416,
					alt: 'Werkauswahl mit Suchfeld, Kategorien und Liste verfügbarer Bibeln.',
					caption:
						'Über die Suche findest du ein bestimmtes Werk; die Kategorien helfen beim Stöbern.'
				}
			},
			{
				id: 'anordnungen',
				title: 'Die acht Kachelanordnungen',
				html: `<table><thead><tr><th>Auswahl</th><th>Anordnung</th><th>Geeignet für</th></tr></thead><tbody><tr><td>Eine Kachel</td><td>Ein großer Lesebereich</td><td>Ruhiges Lesen und lange Texte</td></tr><tr><td>Zwei Spalten</td><td>Zwei Bereiche nebeneinander</td><td>Bibel und Kommentar oder zwei Übersetzungen</td></tr><tr><td>Drei Spalten</td><td>Drei Bereiche nebeneinander</td><td>Bibel, Kommentar und Lexikon</td></tr><tr><td>Vier Spalten</td><td>Vier Bereiche nebeneinander</td><td>Vergleiche auf einem breiten Bildschirm</td></tr><tr><td>Zwei Zeilen</td><td>Zwei Bereiche untereinander</td><td>Lange Textzeilen bei zwei Werken</td></tr><tr><td>Links groß</td><td>Links volle Höhe, rechts zwei Bereiche</td><td>Bibel links mit zwei Begleitwerken rechts</td></tr><tr><td>Rechts groß</td><td>Links zwei Bereiche, rechts volle Höhe</td><td>Ein ausführlicher Begleittext rechts</td></tr><tr><td>Vier Kacheln</td><td>Zwei Spalten und zwei Zeilen</td><td>Vier Texte mit ausgewogener Breite</td></tr></tbody></table><p>Ziehe die Trenner, um Breite oder Höhe anzupassen. Du kannst einen Trenner auch mit <kbd>Tab</kbd> fokussieren und mit den passenden Pfeiltasten verschieben. Die Größen werden für jede Anordnung getrennt gemerkt.</p><p>Beim Wechsel zu weniger Kacheln wandern die Tabs der entfallenden Bereiche in die letzte verbleibende Kachel. Beim Erweitern verteilt Akribos zunächst inaktive Tabs. Ein Layoutwechsel schließt keine Werke. Leere Kacheln kannst du über ihr Pluszeichen füllen.</p>`,
				screenshot: {
					src: '/help/live/layout-menu.webp',
					width: 317,
					height: 323,
					alt: 'Menü Kachelanordnung mit allen acht Layouts und dem Schalter Notizbereich; Drei Spalten ist ausgewählt.',
					caption:
						'Wähle eine Anordnung passend zu Bildschirm und Aufgabe. Der Notizbereich lässt sich zusätzlich einblenden.'
				}
			},
			{
				id: 'verschieben',
				title: 'Tabs umordnen, verschieben und schließen',
				html: `<h3>Innerhalb einer Kachel umordnen</h3><p>Ziehe den Tab am Computer an die gewünschte Position in der Tab-Leiste. Bei vielen Tabs lässt sich die Leiste seitlich scrollen.</p><h3>In eine andere Kachel verschieben</h3><ol><li>Aktiviere den gewünschten Tab.</li><li>Öffne die drei Punkte mit dem Hinweis <strong>Tab verschieben</strong>.</li><li>Wähle unter <strong>Verschieben nach</strong> den gewünschten <strong>Bereich</strong>.</li></ol><p>Du kannst einen Tab am Computer auch direkt in die Tab-Leiste einer anderen Kachel ziehen. Das Menü zum Verschieben erscheint, wenn mehr als eine Kachel vorhanden ist. Die Tabgruppe bleibt beim Verschieben erhalten.</p><h3>Einen Tab schließen</h3><p>Wähle das <strong>×</strong> neben seinem Namen. Dadurch entfernst du das Werk aus dieser Ansicht; du löschst weder das Werk noch persönliche Notizen. Über das Pluszeichen kannst du es später erneut öffnen. Sein bisheriger Tab-Verlauf wird dabei nicht wiederhergestellt.</p>`,
				screenshot: {
					src: '/help/live/tab-move.webp',
					width: 192,
					height: 108,
					alt: 'Menü Tab verschieben mit den Zielbereichen 2 und 3.',
					caption: 'Wähle den Zielbereich, um den aktiven Tab in eine andere Kachel zu verschieben.'
				}
			},
			{
				id: 'gruppen',
				title: 'Gemeinsam lesen oder Stellen unabhängig halten',
				html: `<p>Über <strong>Tabgruppe wechseln</strong> wählst du <strong>A</strong>, <strong>B</strong>, <strong>C</strong>, <strong>D</strong>, <strong>E</strong> oder <strong>Keine</strong>. Der Buchstabe zeigt die Verbindung an.</p><ul><li><strong>Gleicher Buchstabe:</strong> Sichtbare Bibeln, Kommentare und Parallelstellen folgen derselben Lesestelle. Auch verdeckte Tabs dieser Gruppe übernehmen die Stelle für ihr nächstes Öffnen.</li><li><strong>Anderer Buchstabe:</strong> Eine zweite Gruppe kann an einer anderen Stelle arbeiten.</li><li><strong>Keine:</strong> Der einzelne Tab liest unabhängig.</li></ul><p>Beispiel: Bibel und Kommentar in Gruppe A stehen bei Johannes 1. Eine weitere Bibel in Gruppe B bleibt bei 1. Mose 1. Du kannst beide Texte vergleichen, ohne sie beim Scrollen gegenseitig zu verschieben.</p><p>Die Verbindung gehört zum Tab. Verschiebst du ihn in eine andere Kachel, bleibt sein Buchstabe gleich. Neu ergänzte Tabs übernehmen zunächst die Gruppe des zuvor aktiven Tabs. Ein Lexikon scrollt nicht durch Kapitel; seine Gruppe bestimmt, wohin ein angeklicktes Strong-Wort seine Wortstudie öffnet.</p>`,
				screenshot: {
					src: '/help/live/tab-groups.webp',
					width: 271,
					height: 75,
					alt: 'Menü Tabgruppe wechseln mit A bis E und Keine; Gruppe A ist ausgewählt.',
					caption: 'Gleiche Buchstaben verbinden Lesestellen. Keine lässt den Tab unabhängig lesen.'
				}
			},
			{
				id: 'parallelstellen',
				title: 'Mit Parallelstellen einen Textzusammenhang verfolgen',
				html: `<ol><li>Wähle <strong>Zwei Spalten</strong> und öffne in der ersten Kachel deine Bibel.</li><li>Öffne über das Pluszeichen der zweiten Kachel <strong>Werk wählen</strong> und wähle aus <strong>Parallelstellen</strong> ein verfügbares Werk.</li><li>Setze beide Tabs auf dieselbe Tabgruppe, zum Beispiel <strong>A</strong>.</li><li>Gib in der Bibel die Ausgangsstelle ein, etwa <code>Joh 1,1</code>. Lies im Parallelstellen-Tab die Hinweise zur passenden Versnummer.</li><li>Klicke auf eine dort genannte Bibelstelle, um sie im Zusammenhang zu lesen. Die verbundenen Tabs folgen der neuen Stelle.</li><li>Mit <strong>Zurück</strong> in der Werkzeugleiste des Parallelstellen-Tabs kehrst du zu dessen vorheriger Stelle zurück.</li></ol><p>Ein Parallelstellenwerk kann eine Liste verknüpfter Stellen oder erläuternden Text zeigen. Es muss nicht zu jedem Vers einen Eintrag enthalten. Ein leerer Abschnitt bedeutet deshalb nicht automatisch einen Ladefehler. Kommentare verwendest du nach demselben Prinzip; ihre Einträge können einen Vers, mehrere Verse oder einen größeren Abschnitt erläutern.</p><h3>Die Ausgangsstelle beim Nachschlagen sichtbar lassen</h3><p>Wähle <strong>Drei Spalten</strong>, öffne eine zusätzliche Bibel und gib nur diesem Tab die Gruppe <strong>B</strong>. Öffne anschließend am Computer per Rechtsklick das Kontextmenü einer Parallelstelle und wähle <strong>In Tabgruppe B öffnen</strong>. Die erste Bibel und das Parallelstellenwerk in Gruppe A bleiben an ihrer Ausgangsstelle. So kannst du beide Zusammenhänge vergleichen.</p><p>Auf dem Smartphone wechselst du über die gemeinsame Tab-Leiste zwischen den Werken. Die eingestellten Gruppen bleiben wirksam. Weitere Wege zum Öffnen und Kopieren erklärt <a href="/help/bibelstellen/finden-und-weiterlesen#verweise">Bibelstellenverweise verwenden</a>.</p>`,
				screenshot: {
					src: '/help/live/parallel-passages.webp',
					width: 459,
					height: 924,
					alt: 'Geöffneter TSK-Tab zu Johannes 1 mit englischen Erläuterungen und zahlreichen Parallelstellen; TSK und der benachbarte ELB-Tab gehören zur Gruppe A.',
					caption:
						'Das Parallelstellenwerk TSK zeigt zu Johannes 1 englische Stichwörter und zugehörige Bibelstellen. Die Sprache und die Form der Erläuterungen stammen aus dem jeweiligen Werk.'
				}
			},
			{
				id: 'informationen',
				title: 'Quellen- und Nutzungshinweise zum Werk lesen',
				html: `<p>Das <strong>Informationssymbol</strong> am rechten Ende der Tab-Werkzeugleiste öffnet <strong>Werk-Informationen</strong>. Dort findest du Titel, ergänzende Angaben sowie hinterlegte Rechte- und Nutzungshinweise. Bei Lexika können weitere Erläuterungen zur Verwendung enthalten sein.</p><p>Auch die Werkauswahl zeigt am Computer bei längerem Überfahren eines Eintrags eine Vorschau mit Zusatzinformationen. Für die dauerhafte Ansicht der Hinweise öffnest du das Werk und nutzt das Informationssymbol.</p><p>Die Nutzungsbedingungen gehören zum jeweiligen Werk. Wenn du Text in eine Ausarbeitung übernimmst oder weitergibst, beachte die dort hinterlegten Angaben.</p>`
			},
			{
				id: 'mobil-und-speichern',
				title: 'Dieselbe Zusammenstellung mobil und später wiederverwenden',
				html: `<p>Auf schmalen Bildschirmen erscheinen die Tabs aller Kacheln in einer gemeinsamen Leiste. Tippe direkt auf das gewünschte Werk; die zugehörige Kachel wird sichtbar. Deine Anordnung für den Computer bleibt erhalten. Das Verschieben zwischen Kacheln per Ziehen oder Drei-Punkte-Menü erfolgt in der breiten Ansicht.</p><p>Ohne Konto merkt sich dein Browser den Reader-Stand. Für mehrere benannte Ansichten und das Weiterarbeiten auf einem anderen Gerät verwendest du <a href="/help/reader/arbeitsbereich-einrichten">benannte Arbeitsbereiche</a>. Eine Kopie der Reader-Adresse hält die sichtbare Zusammenstellung als Link fest; persönliche Trennergrößen werden nicht über diesen Link geteilt.</p>`
			}
		]
	},
	{
		id: 'woerter-und-strong-finden',
		topic: 'suchen',
		path: '/help/suchen/woerter-und-strong-finden',
		title: 'Wörter, Wortfolgen und Strong-Nummern suchen',
		description:
			'Durchsuche ein bestimmtes Werk, grenze Treffer auf ein Bibelbuch ein und wechsle zwischen Fundstelle und Suchergebnis.',
		icon: 'search',
		audience: 'user',
		level: 'guide',
		keywords: [
			'Suche',
			'Wortsuche',
			'Volltext',
			'Phrase',
			'Anführungszeichen',
			'Ausschließen',
			'Buchfilter',
			'Strong',
			'Treffer',
			'Statistik'
		],
		prerequisite:
			'Ein Bibel- oder Kommentar-Tab. Strong-Suchen benötigen eine Bibel mit Strong-Zuordnungen.',
		sections: [
			{
				id: 'schnellstart',
				title: 'Eine Suche starten und einen Treffer lesen',
				html: `<ol><li>Wähle den Tab der Bibel, die du durchsuchen möchtest.</li><li>Gib <code>gnade wahrheit</code> in ihr Stellen- und Suchfeld ein und bestätige mit <kbd>Enter</kbd>.</li><li>Lies die Treffer in diesem Tab. Die Überschrift nennt den Suchbegriff und das durchsuchte Werk.</li><li>Klicke auf eine Fundstelle. Der Tab öffnet den Bibeltext dort.</li><li>Wähle <strong>Zurück</strong> in der Tab-Werkzeugleiste, um zum vorherigen Suchschritt zurückzukehren.</li></ol>`,
				screenshot: {
					src: '/help/live/reader-search.webp',
					width: 1440,
					height: 1000,
					alt: 'Suche nach gnade wahrheit mit Trefferliste und Verteilung nach Bibelbüchern im Bibel-Tab.',
					caption:
						'Die Suche ersetzt vorübergehend den Lesetext dieses Tabs. Andere Kacheln bleiben sichtbar.'
				}
			},
			{
				id: 'suchausdruecke',
				title: 'Den Suchausdruck passend formulieren',
				html: `<table><thead><tr><th>Eingabe</th><th>Bedeutung</th></tr></thead><tbody><tr><td><code>liebe</code></td><td>Sucht das Wort und passende Wortformen.</td></tr><tr><td><code>lieb</code></td><td>Ein Wortanfang kann auch längere Formen wie „Liebe“ finden.</td></tr><tr><td><code>liebe gott</code></td><td>Beide Begriffe müssen im Treffer vorkommen; ihre Reihenfolge ist frei.</td></tr><tr><td><code>"am Anfang"</code></td><td>Sucht die angegebene Wortfolge.</td></tr><tr><td><code>liebe "des Vaters"</code></td><td>Kombiniert ein Wort mit einer Wortfolge.</td></tr><tr><td><code>liebe -welt</code></td><td>Sucht „liebe“ und schließt Treffer mit „welt“ aus.</td></tr><tr><td><code>G25</code></td><td>Sucht die zugeordnete griechische Strong-Nummer.</td></tr><tr><td><code>H430</code></td><td>Sucht die zugeordnete hebräische Strong-Nummer.</td></tr></tbody></table><p>Setze vor ein auszuschließendes Wort direkt ein Minuszeichen. Ergänze mindestens einen positiven Suchbegriff; <code>-welt</code> allein ergibt keine sinnvolle Suche. Für eine feste Wortfolge verwendest du gerade Anführungszeichen wie im Beispiel.</p><p>Wortformen werden bei der Suche berücksichtigt. Die farbliche Hervorhebung im Treffer hilft beim Lesen, ist aber keine grammatische Analyse. Die genaue Trefferzahl hängt vom Wortlaut und der Aufbereitung der jeweiligen Ausgabe ab.</p>`
			},
			{
				id: 'werkbezug',
				title: 'Immer im richtigen Werk suchen',
				html: `<p>Die Suche gehört zum aktiven Tab, nicht zum gesamten Arbeitsbereich. Im Bibel-Tab findest du Bibelverse; im Kommentar-Tab suchst du dessen Kommentartexte. Möchtest du Ergebnisse zweier Übersetzungen vergleichen, starte die gleiche Suche in ihren jeweiligen Tabs.</p><p>Lexika haben ein anderes Eingabefeld: Dort suchst du einen Eintrag über Strong-Nummer, Grundform oder Umschrift. Das erklärt die Anleitung zur <a href="/help/strong/wortstudie-durchfuehren">Wortstudie</a>. Ein Werk ohne durchsuchbaren Text zeigt einen entsprechenden Hinweis. Du kannst darin weiterhin direkt zu einer verfügbaren Bibelstelle navigieren.</p><p>Stelle und Suche teilen sich dasselbe Feld. <code>Joh 3,16</code> navigiert zur Stelle; <code>Judas</code> ohne Kapitelzahl bleibt eine Wortsuche. Setze eine Wortfolge in Anführungszeichen, wenn du ihren Text suchen möchtest.</p>`
			},
			{
				id: 'buchfilter',
				title: 'Die Treffer auf ein Buch eingrenzen',
				html: `<ol><li>Betrachte <strong>Verteilung nach Büchern</strong> oberhalb der Treffer.</li><li>Wähle das Kürzel oder den Balken eines Buches, zum Beispiel <strong>Joh</strong>.</li><li>Die Trefferliste zeigt nun nur die Fundstellen dieses Buches.</li><li>Wähle <strong>Buchfilter aufheben</strong> oder nochmals das aktive Buch, um wieder alle Treffer zu sehen.</li></ol><p>Das Diagramm behält seine Verteilung über die Bücher bei. So erkennst du weiterhin, wo der Begriff sonst vorkommt. Grau dargestellte Bücher enthalten für die aktuelle Suche keine Treffer; auch sie können als Filter gewählt werden und ergeben dann eine leere Liste.</p><p>Bei vielen Ergebnissen blätterst du mit den Pfeilen unter der Trefferliste. Nach einem Buchwechsel beginnt die Liste auf der ersten Ergebnisseite.</p>`
			},
			{
				id: 'strong-suche',
				title: 'Mit einer Strong-Nummer unabhängig vom deutschen Wort suchen',
				html: `<p>Eine Strong-Nummer verbindet Übersetzungswörter mit einem Wörterbucheintrag des Ausgangstexts. <strong>G</strong> kennzeichnet griechische, <strong>H</strong> hebräische Einträge. Eine Suche nach <code>G25</code> kann deshalb Verse finden, in denen unterschiedliche deutsche Formen desselben zugeordneten Wortes stehen.</p><p>Die Suche zeigt neben Fundstellen auch die Zahl der Vorkommen, die Verteilung nach Büchern und – soweit vorhanden – <strong>Übersetzt als</strong>. Vorkommen und Verse sind verschiedene Zahlen: Ein zugeordnetes Wort kann mehrfach in demselben Vers stehen.</p><p>Alle diese Angaben beziehen sich auf die Bibel des durchsuchten Tabs. Andere Ausgaben können andere Zuordnungen besitzen. Für Bedeutung, Grammatik und den Zusammenhang eines bestimmten angeklickten Wortes öffnest du anschließend eine <a href="/help/strong/wortstudie-durchfuehren">Wortstudie im Lexikon-Tab</a>.</p>`
			},
			{
				id: 'rueckkehr',
				title: 'Suche verlassen und später zurückkehren',
				html: `<p>Das <strong>×</strong> mit dem Hinweis <strong>Suchergebnisse schließen</strong> bringt den bisherigen Lesetext dieses Tabs wieder zum Vorschein. Ein Klick auf einen Treffer kehrt ebenfalls zum Text zurück, diesmal an der gewählten Fundstelle.</p><p>Mit den Pfeilen <strong>Zurück</strong> und <strong>Vor</strong> kannst du während derselben Reader-Sitzung auch Suchbegriffe, Buchfilter und Ergebnisseiten wieder aufrufen. Eine weitere Suche kannst du in einem anderen Tab offenhalten. Beim Tabwechsel wird die Suche nicht automatisch gelöscht.</p><p>Offene Suchansichten gehören zur Reader-Adresse und können in <a href="/help/reader/arbeitsbereich-einrichten">benannten Arbeitsbereichen</a> wieder geöffnet werden. Der schrittweise Tab-Verlauf bleibt dagegen auf die aktuelle Sitzung beschränkt.</p>`
			},
			{
				id: 'fragen',
				title: 'Wenn die Suche nichts oder zu viel findet',
				html: `<details><summary>Ich erhalte keine Treffer.</summary><p>Prüfe zuerst das Werk und einen eventuell aktiven Buchfilter. Verkürze anschließend die Eingabe auf einen Begriff oder einen Wortanfang. Entferne zum Vergleich Ausschlüsse oder Anführungszeichen. Wenn Akribos eine Schreibweise unter „Meintest du …?“ vorschlägt, kannst du sie direkt auswählen.</p></details><details><summary>Der Begriff steht in einer anderen Übersetzung.</summary><p>Jeder Tab sucht in seinem eigenen Werk. Öffne die gewünschte Übersetzung und wiederhole die Suche dort.</p></details><details><summary>Eine Strong-Nummer liefert keine Vorkommen.</summary><p>Die Bibelausgabe benötigt Strong-Zuordnungen. Prüfe außerdem den Buchfilter und ob die Nummer zum hebräischen oder griechischen Text gehört. Ein Wörterbucheintrag kann vorhanden sein, ohne dass diese Bibel dazu zugeordnete Vorkommen enthält.</p></details><details><summary>Ich möchte Ergebnisse auf dem Smartphone lesen.</summary><p>Wähle zuerst den richtigen Tab in der gemeinsamen Tab-Leiste. Das Suchfeld, der Buchfilter und die Trefferliste funktionieren im sichtbaren Tab wie am Computer.</p></details>`
			}
		]
	},
	{
		id: 'wortstudie-durchfuehren',
		topic: 'strong',
		path: '/help/strong/wortstudie-durchfuehren',
		title: 'Ein Wort im griechischen oder hebräischen Text untersuchen',
		description:
			'Öffne eine Wortstudie aus dem Bibeltext und verbinde Wörterbuch, Grammatik, Übersetzungsformen und weitere Fundstellen.',
		icon: 'book',
		audience: 'user',
		level: 'guide',
		keywords: [
			'Strong',
			'Lexikon',
			'Wortstudie',
			'Hebräisch',
			'Griechisch',
			'Urtext',
			'Grammatik',
			'Morphologie',
			'Lemma',
			'Umschrift',
			'Vorkommen',
			'Übersetzt als'
		],
		prerequisite:
			'Eine Bibel mit Strong-Zuordnungen und ein verfügbares Lexikon der passenden Sprache. Nicht jede Bibelausgabe enthält Wortzuordnungen.',
		sections: [
			{
				id: 'schnellstart',
				title: 'Vom angeklickten Wort zur Wortstudie',
				html: `<ol><li>Öffne eine Bibel mit Strong-Zuordnungen, zum Beispiel die im Bild verwendete Elberfelder-Ausgabe.</li><li>Gib <code>Joh 3,16</code> in ihr Stellenfeld ein.</li><li>Klicke im Vers auf das verknüpfte Wort <strong>geliebt</strong>.</li><li>Akribos öffnet den passenden Lexikon-Tab. Lies zuerst das Stichwort und den Bezug zum angeklickten Vers, danach Bedeutung und Grammatik.</li><li>Scrolle im Lexikon nach unten, um <strong>Vorkommen</strong>, <strong>Übersetzt als</strong> und weitere Fundstellen zu untersuchen.</li></ol>`,
				screenshot: {
					src: '/help/live/strong-study.webp',
					width: 1440,
					height: 1000,
					alt: 'Johannes 3,16 mit griechischer Wortstudie zu geliebt, Strong G25, mit Grammatik und Wörterbuchdefinition.',
					caption:
						'Der Lexikon-Tab verbindet den Eintrag G25 mit dem angeklickten Wort „geliebt“ in Johannes 3,16.'
				}
			},
			{
				id: 'eintrag',
				title: 'Die Angaben am Anfang des Eintrags verstehen',
				html: `<dl class="definition-list"><div><dt>Strong-Nummer</dt><dd>Die Kennung des Wörterbucheintrags: G für Griechisch, H für Hebräisch.</dd></div><div><dt>Grundform</dt><dd>Das Stichwort in der Schrift der Ausgangssprache. Hebräischer Text wird von rechts nach links gelesen.</dd></div><div><dt>Umschrift und Aussprache</dt><dd>Lesehilfen, sofern sie im gewählten Lexikon vorhanden sind.</dd></div><div><dt>Wort und Bibelstelle</dt><dd>Der Bezug zu deinem Klick im Bibeltext, etwa „geliebt“ und Joh 3,16.</dd></div><div><dt>Grammatik</dt><dd>Angaben zur konkreten Wortform des Ausgangstexts an der angeklickten Stelle, soweit passende Daten verfügbar sind.</dd></div><div><dt>Definition</dt><dd>Die Erklärung aus genau dem Lexikon, das du geöffnet hast.</dd></div></dl><p>Die Grundform im Wörterbuch und die grammatische Form im Vers erfüllen unterschiedliche Aufgaben. Lies eine Definition deshalb zusammen mit dem Vers und seinem Zusammenhang. Mehrere mögliche Bedeutungen eines Stichworts treffen nicht automatisch alle gleichzeitig auf jede Fundstelle zu.</p><p>Unter <strong>Siehe auch</strong> kannst du verwandte Strong-Einträge öffnen. Der Tab-Verlauf hilft dir, danach zum vorherigen Eintrag zurückzukehren.</p>`
			},
			{
				id: 'definition-und-original',
				title: 'Definition, Herkunft und englisches Original lesen',
				html: `<p>Je nach Lexikon findest du getrennte Abschnitte für <strong>Bedeutung</strong>, <strong>Herkunft</strong> und <strong>King-James-Wiedergaben</strong>. Die King-James-Angaben beschreiben die Wiedergaben dieser Ausgabe; sie sind nicht automatisch die Übersetzungsformen der deutschen Bibel, die du gerade liest.</p><p>Ist eine deutsche Vorübersetzung des englischen Lexikons vorhanden, kannst du darunter <strong>Englisches Original</strong> aufklappen. Der Hinweis <strong>Automatisch vorübersetzt · fachlich noch nicht geprüft</strong> kennzeichnet entsprechend vorbereitete deutsche Texte. Vergleiche bei einer entscheidenden Formulierung die Originalfassung und den biblischen Zusammenhang.</p><p>Angaben zum Werk und Literaturhinweise findest du über das Informationssymbol des Lexikon-Tabs. Welche Abschnitte vorhanden sind, hängt vom gewählten Lexikon ab.</p>`
			},
			{
				id: 'direkte-eingabe',
				title: 'Einen Lexikoneintrag direkt suchen',
				html: `<ol><li>Öffne über das Pluszeichen einen passenden Lexikon-Tab.</li><li>Gib in <strong>Strong-Nummer oder Wort</strong> zum Beispiel <code>G25</code> ein.</li><li>Bestätige mit <kbd>Enter</kbd>.</li></ol><p>Du kannst auch die Grundform oder Umschrift eines Eintrags verwenden. Akribos sucht im ausgewählten Lexikon zunächst nach einem passenden Eintrag; Wortanfänge können beim Auffinden helfen. Für eine gezielte Wortstudie ist die Strong-Nummer am eindeutigsten.</p><p>Ein direkt geöffneter Wörterbucheintrag besitzt nicht unbedingt den Bezug zu einem bestimmten Vers und einer Übersetzung. Öffne ihn über ein verknüpftes Wort im Bibeltext, wenn du Grammatik und Vorkommen aus dieser Bibel sehen möchtest. Steht „Kein Eintrag“ im Tab, prüfe die Nummer und die Sprache des gewählten Lexikons.</p>`
			},
			{
				id: 'lexikonwahl',
				title: 'Bestimmen, in welchem Tab die Wortstudie erscheint',
				html: `<p>Akribos verwendet nach Möglichkeit einen bereits geöffneten Lexikon-Tab derselben <a href="/help/reader/werke-tabs-und-layouts#gruppen">Tabgruppe</a>. Seine Sprache muss zur Strong-Nummer passen: Eine griechische Nummer öffnet keinen hebräischen Wörterbucheintrag.</p><p>Wenn noch kein passendes Lexikon in dieser Gruppe geöffnet ist, ergänzt Akribos eines. Ein Lexikon in einer anderen sichtbaren Kachel ermöglicht es, Bibeltext und Wortstudie gleichzeitig zu lesen. Du kannst das Lexikon auch selbst über die Werkauswahl öffnen und der passenden Gruppe zuweisen.</p><p>Für den Vergleich zweier Lexika öffnest du beide als eigene Tabs. Jeder Tab behält seinen eigenen Eintrag. Bei einem erneuten Wortklick wird der erste passende Lexikon-Tab der Gruppe verwendet; die einzelnen Lexika werden nicht zu einer gemeinsamen Definition zusammengefasst.</p>`
			},
			{
				id: 'vorkommen',
				title: 'Vorkommen und Übersetzungsformen auswerten',
				html: `<p>Die Quellenangabe im Eingabefeld und der Zusatz unter <strong>Vorkommen</strong> nennen die Bibel, aus der die Zahlen stammen. Es ist die Übersetzung, deren Wort du angeklickt hast.</p><ul><li><strong>Vorkommen</strong> zählt die zugeordneten Wortvorkommen.</li><li><strong>Verse</strong> zählt die Verse, in denen sie auftreten. Mehrere Vorkommen in einem Vers erhöhen nicht die Verszahl.</li><li><strong>Übersetzt als</strong> zeigt die Wiedergaben in dieser Bibel. Die Mitte des Diagramms nennt Formen und Gesamtvorkommen.</li><li><strong>Verteilung nach Büchern</strong> zeigt, in welchen Büchern die Zuordnung vorkommt.</li></ul><p>Das Kreisdiagramm fasst seltene und weitere Wiedergaben zusammen, damit die häufigsten lesbar bleiben. Die Tabelle beim Diagramm enthält die gelieferten Einträge ausführlicher. Ein Pluszeichen bei der Zahl der Formen bedeutet, dass nur eine Mindestzahl bekannt ist; nicht einzeln gelieferte Formen bleiben als Rest erkennbar.</p><p>Die Wortzuordnungen gehören zu den Daten der Ausgabe. Ein Hinweis auf eine automatische, noch nicht fachlich bestätigte Zuordnung ist in den Fundstellen der Wortstudie weiterhin abrufbar. Ein anderer Wortlaut oder eine andere Zuordnung kann zu anderen Zahlen führen.</p>`,
				screenshot: {
					src: '/help/live/strong-statistics.webp',
					width: 459,
					height: 924,
					alt: 'Wortstudie G3056 in der Elberfelder-Ausgabe mit 335 Vorkommen in 315 Versen, Übersetzungsformen, Buchverteilung und Fundstellen.',
					caption:
						'Ein weiteres Beispiel: G3056 („Wort“) in der Elberfelder-Ausgabe. Das Einstiegsbild zeigt G25; hier lassen sich Übersetzungsformen und Fundstellen von G3056 vergleichen.'
				}
			},
			{
				id: 'fundstellen',
				title: 'Fundstellen eingrenzen und im Zusammenhang öffnen',
				html: `<ol><li>Wähle im Buchdiagramm das gewünschte Buch.</li><li>Lies die Einträge unter <strong>Vorkommen in …</strong>. Das untersuchte Strong-Wort ist im Vers hervorgehoben.</li><li>Öffne eine Fundstelle durch Klick auf den Versbereich. Du kannst sie auch mit der Tastatur fokussieren und mit <kbd>Enter</kbd> öffnen.</li><li>Verwende <strong>Alle Bücher</strong>, um den Buchfilter zu lösen.</li></ol><p>Unter einer längeren Fundstellenliste blätterst du mit den Pfeilen zwischen den Ergebnisseiten. Der Buchfilter hilft beim Lesen eines begrenzten Textzusammenhangs; die Gesamtstatistik dient weiterhin der Orientierung über das Werk.</p><p>Für eine reine Fundstellensuche ohne Lexikondefinition gibst du dieselbe Nummer im Bibel-Tab ein. Mehr dazu unter <a href="/help/suchen/woerter-und-strong-finden#strong-suche">Strong-Nummern suchen</a>.</p>`
			},
			{
				id: 'eigene-strong-seite',
				title: 'Eine Strong-Seite öffnen und Übersetzungsformen filtern',
				html: `<p>Für einen direkt verlinkbaren Überblick gibt es auch eigenständige Strong-Seiten, zum Beispiel <a href="/G25">G25</a>. Sie zeigen Definition, Vorkommen und Statistiken außerhalb der Reader-Kacheln. Beachte die bei den Vorkommen genannte Bibelausgabe; sie muss nicht dieselbe sein wie die Quelle einer zuvor geöffneten Wortstudie.</p><ol><li>Öffne die gewünschte Strong-Seite.</li><li>Wähle im Buchdiagramm ein Buch, um die Fundstellen einzugrenzen.</li><li>Wähle unter <strong>Übersetzt als</strong> eine Wiedergabe, um nur die dazu passenden Fundstellen zu lesen.</li><li>Löse den Filter mit <strong>Übersetzungsfilter aufheben</strong> oder <strong>Buchfilter aufheben</strong>.</li></ol><p>Buch und Übersetzungsvariante lassen sich gemeinsam filtern. Die Pfeile unter der Liste blättern durch die Fundstellen. Auf schmalen Bildschirmen klappst du dafür <strong>Nach Übersetzungsvariante filtern</strong>, <strong>Nach Bibelbuch filtern</strong> und <strong>Bedeutung und Herkunft</strong> auf. Die Reader-Wortstudie behält daneben ihren eigenen Eintrag und ihre eigenen Bedienelemente.</p>`
			},
			{
				id: 'fragen',
				title: 'Fehlende Angaben und mobile Ansicht',
				html: `<details><summary>Ein Wort lässt sich nicht anklicken.</summary><p>Es besitzt in dieser Ausgabe möglicherweise keine Strong-Zuordnung. Wähle eine Bibel mit solchen Zuordnungen oder suche eine bekannte Strong-Nummer direkt im passenden Lexikon.</p></details><details><summary>Warum fehlt „Grammatik“?</summary><p>Grammatische Angaben erscheinen nur, wenn für die Stelle und das untersuchte Wort entsprechende Daten des Ausgangstexts verfügbar sind. Eine Wörterbuchdefinition allein liefert keine konkrete grammatische Form für jeden Vers.</p></details><details><summary>Die Definition erscheint, aber es fehlen Vorkommen.</summary><p>Prüfe, ob der Eintrag über ein Wort aus einer Bibel geöffnet wurde und eine Quellübersetzung genannt ist. Fehlt sie, öffne die Wortstudie erneut aus dem Bibeltext. Bei einem Ladefehler kannst du den Eintrag erneut öffnen.</p></details><details><summary>Auf dem Smartphone ist nach dem Wortklick die Bibel verschwunden.</summary><p>Die mobile Ansicht zeigt jeweils den aktiven Tab. Wähle in der gemeinsamen Tab-Leiste deine Bibel, um zum Text zurückzukehren. Das Lexikon bleibt als weiterer Tab geöffnet.</p></details>`
			}
		]
	},
	{
		id: 'kopieren-markieren-und-wiederfinden',
		topic: 'verse',
		path: '/help/verse/kopieren-markieren-und-wiederfinden',
		title: 'Verse kopieren, markieren und wiederfinden',
		description:
			'Öffne das Versmenü, übernimm Text oder Link und ordne wichtige Stellen mit benannten Markierungsfarben.',
		icon: 'highlight',
		audience: 'user',
		level: 'guide',
		keywords: [
			'Versmenü',
			'Kopieren',
			'Link',
			'Markierung',
			'Farbe',
			'Hervorheben',
			'Teilmarkierung',
			'Stellensammlung',
			'Vers 1'
		],
		prerequisite:
			'Kopieren funktioniert ohne Konto. Für Markierungen, Notizen und Stellensammlungen musst du angemeldet sein.',
		sections: [
			{
				id: 'schnellstart',
				title: 'Einen Vers kopieren oder farbig merken',
				html: `<ol><li>Öffne zum Beispiel <a href="/Joh3,16">Johannes 3,16</a> in deiner Bibel.</li><li>Klicke auf die kleine <strong>Versnummer 16</strong>. Das Versmenü öffnet sich.</li><li>Wähle <strong>Vers kopieren</strong>, um Stellenangabe und Text in die Zwischenablage zu übernehmen.</li><li>Zum dauerhaften Hervorheben öffnest du das Menü erneut und wählst unter <strong>Markieren</strong> eine Farbe.</li></ol><p>Für Vers 1 verwendest du die große Kapitelzahl am Kapitelanfang. Sie öffnet dasselbe Menü für den ersten Vers.</p>`,
				screenshot: {
					src: '/help/live/verse-menu.webp',
					width: 320,
					height: 398,
					alt: 'Versmenü für Johannes 3,16 mit Kopieraktionen, Markierungsfarben, Notizen und Stellensammlungen.',
					caption:
						'Die Versnummer öffnet die Aktionen zum ganzen Vers. Persönliche Farben und Sammlungen erscheinen nach der Anmeldung.'
				}
			},
			{
				id: 'menue',
				title: 'Die Aktionen des Versmenüs',
				html: `<dl class="definition-list"><div><dt>Nur diesen Vers anzeigen</dt><dd>Öffnet die direkte Adresse der ausgewählten Bibelstelle.</dd></div><div><dt>Vers kopieren</dt><dd>Kopiert die vollständige Stellenangabe und den Text aus dem angeklickten Werk. Nach erfolgreichem Kopieren erscheint kurz „Kopiert“.</dd></div><div><dt>Link kopieren</dt><dd>Kopiert einen direkten Link zu dieser Stelle. Wer den Link öffnet, liest sie in seiner verfügbaren Leseansicht.</dd></div><div><dt>Markieren</dt><dd>Zeigt deine persönlichen Farben. Ein Klick markiert den ganzen Vers.</dd></div><div><dt>Notizen zur Stelle</dt><dd>Öffnet den Notizbereich zum gewählten Vers. Dort kannst du passende Notizen lesen oder neu beginnen.</dd></div><div><dt>Stellensammlungen</dt><dd>Fügt den Vers einer Sammlung hinzu oder entfernt ihn aus einer bereits ausgewählten Sammlung.</dd></div></dl><p>Ohne Anmeldung erscheint <strong>Zum Speichern anmelden</strong> für persönliche Funktionen. Zum Schließen des Menüs klickst du außerhalb oder drückst <kbd>Escape</kbd>.</p><p><strong>Ein Stellenlink und ein Arbeitsbereich-Link sind verschieden:</strong> „Link kopieren“ im Versmenü teilt die Bibelstelle. Für die Zusammenstellung mit Tabs und Suchen kopierst du die vollständige Reader-Adresse aus der Adressleiste. Beide Linkarten erteilen keinen Zugriff auf private Werke oder persönliche Notizen.</p>`
			},
			{
				id: 'markieren',
				title: 'Eine Markierung ändern oder entfernen',
				html: `<ol><li>Öffne über die Versnummer erneut das Menü des markierten Verses.</li><li>Die aktive Farbe ist hervorgehoben.</li><li>Wähle eine andere Farbe, um den Vers umzufärben.</li><li>Wähle die bereits aktive Farbe noch einmal, um die Markierung zu entfernen.</li></ol><p>Eine Markierung aus diesem Menü gilt für den ganzen Vers und erscheint auch in anderen geöffneten Bibelübersetzungen derselben Stelle. Sie gehört zu deinem Konto. Andere Leser sehen sie nicht allein dadurch, dass du ihnen einen Verslink sendest.</p><p>Die aktuelle Oberfläche erstellt Markierungen über die Versnummer für ganze Verse. Eine Textauswahl mit Maus oder Fingern erzeugt keine Teilmarkierung. Bereits vorhandene Markierungen einzelner Wörter können im Text sichtbar sein; solche Teilmarkierungen beziehen sich auf die jeweilige Übersetzung.</p>`
			},
			{
				id: 'farben',
				title: 'Farben mit einer eigenen Bedeutung versehen',
				html: `<ol><li>Öffne <a href="/account?tab=appearance">Einstellungen → Darstellung</a>.</li><li>Scrolle zu <strong>Versmarkierungen</strong>.</li><li>Trage neben einer Farbe einen Namen ein, zum Beispiel „Zusagen“, „Fragen“ oder „Weiter untersuchen“.</li><li>Wähle <strong>Speichern</strong> in derselben Zeile.</li></ol><p>Die Namen helfen dir beim späteren Auswählen der Farbe. Es gibt keine vorgegebene theologische Bedeutung der Farben; du legst deine Ordnung selbst fest.</p><h3>Eine zusätzliche Farbe anlegen</h3><ol><li>Wähle unten im Farbfeld einen neuen Farbton.</li><li>Vergib optional einen Namen.</li><li>Wähle <strong>Farbe hinzufügen</strong>.</li></ol><p>Dein Konto beginnt mit zehn Farben und kann bis zu 30 enthalten. Vorhandene Farben kannst du benennen; die Oberfläche bietet derzeit kein nachträgliches Ändern oder Löschen eines Farbtons an. Wähle daher gut unterscheidbare Farben und sprechende Namen.</p>`
			},
			{
				id: 'wiederfinden',
				title: 'Alle Verse einer Farbe wiederfinden',
				html: `<ol><li>Öffne in <strong>Darstellung → Versmarkierungen</strong> die gewünschte Farbe.</li><li>Wähle daneben <strong>Verse anzeigen</strong>.</li><li>Die Seite <strong>Markierte Verse: …</strong> listet die zugehörigen Stellen.</li><li>Wähle eine Stellenangabe, um sie im Reader zu öffnen.</li></ol><p>Die Anzeige nennt die verwendete Bibel, soweit Text verfügbar ist. Bei einer gespeicherten Markierung über mehrere Verse erscheint ein Eintrag am Anfang der Passage; die Stellenangabe zeigt den gesamten Bereich. Fehlt für ein Werk inzwischen die Freigabe, gibt die Übersicht dessen geschützten Text nicht aus.</p><p>Mit <strong>Zurück zu Versmarkierungen</strong> gelangst du wieder zur Farbverwaltung. Eine leere Übersicht bedeutet, dass dieser Farbe noch keine sichtbaren Einträge zugeordnet sind.</p>`,
				screenshot: {
					src: '/help/live/highlights-list.webp',
					width: 768,
					height: 316,
					alt: 'Markierte Verse der Farbe Beobachtung mit Johannes 3,16 und dem Text der Elberfelder-Bibel.',
					caption:
						'Verse anzeigen sammelt die Stellen einer Markierungsfarbe. Die grüne Stellenangabe führt zurück zum Bibeltext.'
				}
			},
			{
				id: 'notizen-und-sammlungen',
				title: 'Aus einer Fundstelle einen Studiengedanken machen',
				html: `<p>Eine Farbe eignet sich zum schnellen Kennzeichnen. Wenn du einen Gedanken erläutern möchtest, öffne im Versmenü die <strong>Notizen</strong> zur Stelle. Deine Notiz kann die Beobachtung, eine offene Frage oder einen Verweis auf eine weitere Passage enthalten. Die ausführlichen Schritte findest du unter <a href="/help/dokumente">Notizen und Dokumente</a>.</p><p>Für eine geordnete Folge mehrerer Stellen nutzt du <strong>Stellensammlungen</strong>. Wähle im Versmenü den Namen einer vorhandenen Sammlung. Ein Häkchen zeigt, dass der Vers enthalten ist; ein erneuter Klick entfernt ihn daraus. Über <strong>Neue Liste mit diesem Vers</strong> beginnst du direkt mit der ausgewählten Stelle. Die Verwaltung und Freigaben erklärt <a href="/help/listen">die Hilfe zu Stellensammlungen</a>.</p>`
			},
			{
				id: 'fragen',
				title: 'Häufige Fragen zu Kopieren und Markieren',
				html: `<details><summary>„Vers kopieren“ zeigt keine Bestätigung.</summary><p>Der Browser kann den Zugriff auf die Zwischenablage blockieren. Prüfe seine Berechtigung für die Seite oder markiere den Text und kopiere ihn mit der üblichen Kopierfunktion deines Geräts.</p></details><details><summary>Ich tippe auf ein Wort und lande im Lexikon.</summary><p>Das Wort besitzt eine Strong-Verknüpfung. Für das Versmenü tippe auf die Versnummer, bei Vers 1 auf die große Kapitelzahl.</p></details><details><summary>Im Versmenü fehlen Farben.</summary><p>Prüfe, ob du angemeldet bist. Die Markierungsfarben gehören zu deinem Konto und werden Gästen nicht angeboten.</p></details><details><summary>Kann ich mehrere unterschiedliche Farben auf denselben ganzen Vers legen?</summary><p>Die Auswahl im Versmenü verwendet eine aktive Farbe für den ganzen Vers. Eine neue Auswahl ersetzt die vorherige. Für mehrere gedankliche Zuordnungen eignen sich zusätzlich Notizen mit Schlagwörtern oder verschiedene Stellensammlungen.</p></details>`
			}
		]
	},
	{
		id: 'anmelden-und-profil-verwalten',
		topic: 'konto',
		path: '/help/konto/anmelden-und-profil-verwalten',
		title: 'Anmelden, das Profil pflegen und den Zugang verwalten',
		description:
			'Nutze E-Mail-Link oder Anmeldecode, verwalte deinen Anzeigenamen und erfahre, wie ein optionales Passwort den Anmeldeweg verändert.',
		icon: 'user',
		audience: 'user',
		level: 'guide',
		keywords: [
			'Konto',
			'Anmelden',
			'Registrieren',
			'E-Mail',
			'Code',
			'Anmeldecode',
			'Passwort',
			'Profil',
			'Anzeigename',
			'Abmelden',
			'Konto löschen'
		],
		prerequisite:
			'Zugriff auf das Postfach deiner E-Mail-Adresse. Zum bloßen Bibellesen benötigst du kein Konto.',
		sections: [
			{
				id: 'schnellstart',
				title: 'Mit deiner E-Mail-Adresse beginnen',
				html: `<ol><li>Öffne <a href="/login">Anmelden</a>.</li><li>Trage deine E-Mail-Adresse ein und wähle <strong>Weiter</strong>.</li><li>Wenn dein Konto kein Passwort verwendet, öffne die neue Anmelde-E-Mail und gib den sechsstelligen <strong>Anmeldecode</strong> im noch geöffneten Dialog ein.</li><li>Wähle <strong>Anmelden</strong>.</li></ol><p>Dieser Ablauf gilt auch für den ersten Zugang: Ein neues Konto entsteht erst nach deiner erfolgreichen E-Mail-Bestätigung. Wenn bereits ein Passwort hinterlegt ist, zeigt Akribos nach „Weiter“ stattdessen das Passwortfeld.</p>`,
				screenshot: {
					src: '/help/live/login-start.webp',
					width: 384,
					height: 329,
					alt: 'Anmeldeformular mit E-Mail-Feld, fiktiver Beispieladresse und Schaltfläche Weiter.',
					caption:
						'Der Einstieg fragt nach deiner E-Mail-Adresse. Danach folgt der zu deinem Konto passende Anmeldeweg.'
				}
			},
			{
				id: 'link-oder-code',
				title: 'Anmeldecode und E-Mail-Link richtig verwenden',
				html: `<h3>Mit dem Code im geöffneten Dialog</h3><p>Der Code gehört zu der Anmeldung, mit der du die E-Mail angefordert hast. Gib ihn in demselben Browser ein. Wenn du die E-Mail auf dem Smartphone liest und dich am Computer anmelden möchtest, übertrage den Code in den geöffneten Anmeldedialog am Computer.</p><h3>Mit dem Link aus der E-Mail</h3><ol><li>Öffne den Anmeldelink aus der E-Mail.</li><li>Prüfe die angezeigte E-Mail-Adresse.</li><li>Bestätige mit <strong>Anmelden</strong>.</li></ol><p>Damit meldest du dich in dem Browser an, in dem du den Link bestätigst. Das bloße Öffnen der Linkseite verbraucht die Anmeldung noch nicht.</p><p>Link und Code sind <strong>15 Minuten gültig</strong> und gehören zum selben einmaligen Zugang. Sobald einer erfolgreich verwendet wurde, kann der andere nicht noch einmal genutzt werden. Nach erneutem Versand gelten nur noch der neue Link und der neue Code. Nach fünf falschen Codeversuchen ist eine neue Anmelde-E-Mail nötig.</p><p>Mit <strong>Andere E-Mail-Adresse verwenden</strong> gehst du zur Adressauswahl zurück. Mit <strong>Anmelde-E-Mail erneut senden</strong> forderst du im Code-Dialog eine neue Nachricht an.</p>`
			},
			{
				id: 'bestehendes-passwort',
				title: 'Mit einem vorhandenen Passwort anmelden',
				html: `<ol><li>Gib unter <strong>Anmelden</strong> zuerst deine E-Mail-Adresse ein.</li><li>Wähle <strong>Weiter</strong>.</li><li>Trage dein Passwort im anschließend angezeigten Passwortfeld ein.</li><li>Wähle <strong>Anmelden</strong>.</li></ol><p>Wenn eine ältere Registrierung noch nicht bestätigt wurde, weist Akribos darauf hin. Über <strong>Aktivierungslink erneut senden</strong> kannst du die Bestätigung erneut anfordern.</p><h3>Passwort vergessen</h3><ol><li>Öffne den Link <strong>Passwort zurücksetzen</strong> unter dem Passwortformular.</li><li>Gib deine E-Mail-Adresse ein und wähle <strong>Link senden</strong>.</li><li>Öffne den Link aus der E-Mail.</li><li>Trage das neue Passwort zweimal ein und wähle <strong>Speichern</strong>.</li></ol><p>Wenn du dich normalerweise per Anmeldecode anmeldest, benötigst du zum nächsten Zugang keinen Passwort-Reset. Beginne wieder mit deiner E-Mail-Adresse.</p>`
			},
			{
				id: 'profil',
				title: 'Den Anzeigenamen ändern',
				html: `<ol><li>Öffne im Konto-Menü <strong>Mein Konto</strong> oder direkt <a href="/account">Einstellungen</a>.</li><li>Wähle <strong>Profil &amp; Sicherheit</strong>.</li><li>Ändere unter <strong>Profil</strong> den <strong>Anzeigenamen</strong>.</li><li>Wähle <strong>Speichern</strong> und beachte die Rückmeldung <strong>Gespeichert.</strong></li></ol><p>Der Anzeigename hilft anderen Personen, deine Beiträge auf geteilten Stellensammlungen zuzuordnen. Die E-Mail-Adresse wird im Profil angezeigt, ist dort aber nicht bearbeitbar. Der Anzeigename verändert deine Anmeldeadresse nicht.</p>`
			},
			{
				id: 'passwort-festlegen',
				title: 'Ein Passwort festlegen oder ändern',
				html: `<h3>Von der E-Mail-Anmeldung zu einem Passwort wechseln</h3><ol><li>Öffne <strong>Profil &amp; Sicherheit</strong>.</li><li>Trage unter <strong>Passwort festlegen</strong> ein neues Passwort in beide Felder ein.</li><li>Verwende mindestens zehn Zeichen.</li><li>Bestätige mit <strong>Speichern</strong>.</li></ol><p>Danach führt deine E-Mail-Adresse bei der Anmeldung zum Passwortformular. Andere angemeldete Geräte werden beim Speichern abgemeldet; auf diesem Gerät bleibst du angemeldet. Bereits angeforderte Anmeldelinks und Codes werden ungültig.</p><h3>Ein vorhandenes Passwort ändern</h3><p>Unter <strong>Passwort ändern</strong> gibst du zusätzlich zuerst dein <strong>Aktuelles Passwort</strong> an. Trage das neue Passwort zweimal ein und speichere. Stimmen die Wiederholung oder das aktuelle Passwort nicht, zeigt das Formular den entsprechenden Hinweis.</p><p>Die aktuelle Oberfläche bietet keine Schaltfläche, um ein gesetztes Passwort wieder zu entfernen und zur reinen E-Mail-Anmeldung zurückzuwechseln.</p>`
			},
			{
				id: 'abmelden-und-loeschen',
				title: 'Abmelden und eine Kontolöschung anfragen',
				html: `<p>Über <strong>Abmelden</strong> im Konto-Menü oder am Ende der Einstellungen beendest du die Anmeldung auf diesem Gerät. Deine gespeicherten Notizen, Markierungen, Sammlungen und Arbeitsbereiche werden dadurch nicht gelöscht. Beim erneuten Anmelden mit derselben Adresse greifst du wieder auf dein Konto zu.</p><p>Die Einstellungen enthalten derzeit keine Schaltfläche zur selbstständigen Kontolöschung. Wenn du dein Konto löschen lassen oder deine Anmeldeadresse klären möchtest, nutze den <a href="/impressum">Kontakt im Impressum</a>. Sichere benötigte eigene Texte zuvor über <a href="/help/import-export">den Dokumentexport</a>.</p><p>API-Schlüssel werden ebenfalls unter „Profil &amp; Sicherheit“ verwaltet. Für normales Bibelstudium brauchst du keinen Schlüssel. Die technische Nutzung ist getrennt unter <a href="/help/api">API &amp; Integrationen</a> beschrieben.</p>`
			},
			{
				id: 'fragen',
				title: 'Häufige Probleme bei der Anmeldung',
				html: `<details><summary>Es kommt keine E-Mail an.</summary><p>Prüfe die eingegebene Adresse sowie Spam- und andere Posteingangsordner. Warte einen Moment und nutze anschließend „Anmelde-E-Mail erneut senden“. Eine neu angeforderte Nachricht ersetzt ältere Codes und Links.</p></details><details><summary>Der gerade erhaltene Code wird abgewiesen.</summary><p>Verwende den Code aus der neuesten Nachricht im ursprünglichen Browserdialog. Ein Code aus einer anderen Anmeldung, ein abgelaufener Code oder ein bereits verwendeter Zugang funktioniert nicht. Fordere bei Bedarf eine neue Nachricht an und beginne damit erneut.</p></details><details><summary>Der Link hat mich auf dem falschen Gerät angemeldet.</summary><p>Der Link meldet den Browser an, in dem du ihn bestätigst. Starte auf dem gewünschten Gerät einen neuen Zugang und gib dort den neuen Code ein.</p></details><details><summary>Akribos meldet „Zu viele Versuche“.</summary><p>Warte, bevor du einen weiteren Versuch oder erneuten Versand auslöst. Wiederholtes schnelles Absenden hilft nicht, die Begrenzung aufzuheben.</p></details><details><summary>Meine Notizen fehlen nach der Anmeldung.</summary><p>Prüfe die E-Mail-Adresse in deinem Profil. Persönliche Inhalte gehören zur jeweiligen Adresse; eine andere Adresse kann ein anderes Konto öffnen.</p></details>`
			}
		]
	},
	{
		id: 'leseansicht-anpassen',
		topic: 'konto',
		path: '/help/konto/leseansicht-anpassen',
		title: 'Textgröße, Design und Standardübersetzung einstellen',
		description:
			'Stimme die Lesedarstellung auf dein Gerät ab und wähle die Bibel für Vorschauen und eingefügte Bibelzitate.',
		icon: 'user',
		audience: 'user',
		level: 'guide',
		keywords: [
			'Darstellung',
			'Textgröße',
			'Schriftgröße',
			'A+',
			'A−',
			'Design',
			'Dunkel',
			'Hell',
			'Theme',
			'Standardbibel',
			'Standardübersetzung',
			'Vorschau'
		],
		prerequisite:
			'Textgröße und Design lassen sich im Reader auch als Gast ändern. Die persönlichen Einstellungen im Konto benötigen eine Anmeldung.',
		sections: [
			{
				id: 'schnellstart',
				title: 'Eine angenehme Leseansicht wählen',
				html: `<ol><li>Öffne <a href="/account?tab=appearance">Einstellungen → Darstellung</a>.</li><li>Wechsle über das Sonnen- beziehungsweise Mondsymbol zum gewünschten hellen oder dunklen Design.</li><li>Passe unter <strong>Textgröße im Bibeltext</strong> die Größe mit <strong>A−</strong> und <strong>A+</strong> an.</li><li>Wähle deine bevorzugte <strong>Standardübersetzung</strong> und bestätige mit <strong>Standardübersetzung speichern</strong>.</li></ol><p>Die Textvorschau hilft dir beim Einstellen der Größe. Für Layout und geöffnete Werke verwendest du anschließend die Bedienelemente im Reader.</p>`,
				screenshot: {
					src: '/help/live/account-appearance.webp',
					width: 1440,
					height: 1000,
					alt: 'Einstellungen Darstellung mit Design, Standardübersetzung, Textgröße und benannter Markierungsfarbe Beobachtung.',
					caption:
						'Die Darstellung bündelt persönliche Leseeinstellungen und Markierungsfarben. Die Standardübersetzung wird separat gespeichert.'
				}
			},
			{
				id: 'textgroesse',
				title: 'Die Leseschrift vergrößern oder verkleinern',
				html: `<p><strong>A+</strong> vergrößert die Leseschrift, <strong>A−</strong> verkleinert sie. Die Einstellung reicht von <strong>85 bis 140 Prozent</strong> in Schritten von fünf Prozentpunkten. An der jeweiligen Grenze ist die entsprechende Schaltfläche deaktiviert.</p><p>Am breiten Bildschirm stehen A− und A+ zusätzlich oben im Reader bereit. Auf schmalen Bildschirmen findest du die Einstellung unter <strong>Mein Konto → Darstellung</strong>. Falls du die gesamte Oberfläche einschließlich der Menüs größer brauchst, verwende zusätzlich die Vergrößerungsfunktion deines Browsers oder Geräts.</p><p>Die Einstellung betrifft die Lesetexte. Bedienelemente, Beschriftungen und Diagramme behalten ihre eigenen Größen. Lexikondefinitionen sind etwas kompakter gesetzt; sie folgen dennoch deiner persönlichen Leseschrift-Einstellung.</p>`
			},
			{
				id: 'design',
				title: 'Zwischen hellem und dunklem Design wechseln',
				html: `<p>Das Sonnen- oder Mondsymbol ist auch im Kopfbereich der Anwendung erreichbar. Sein Hinweis nennt jeweils das Ziel: <strong>Helles Design</strong> oder <strong>Dunkles Design</strong>. Ein Klick wechselt sofort.</p><p>Beim ersten Besuch ohne eigene Einstellung kann sich Akribos nach dem Farbschema deines Geräts richten. Nach deiner Auswahl merkt sich der Browser hell oder dunkel. Für einen späteren Wechsel nutzt du das Symbol erneut.</p><p>Am Smartphone kannst du ein anderes Design oder eine andere Schriftgröße verwenden als am Computer. Bereits gewählte Einstellungen bleiben für das jeweilige Gerät maßgeblich. Angemeldete Änderungen dienen außerdem als Vorgabe, wenn du Akribos auf einem weiteren Gerät erstmals einrichtest.</p>`
			},
			{
				id: 'standarduebersetzung',
				title: 'Die Bibel für Vorschauen und Zitate bestimmen',
				html: `<ol><li>Öffne das Auswahlfeld <strong>Standardübersetzung</strong>.</li><li>Wähle eine verfügbare Bibel.</li><li>Bestätige mit <strong>Standardübersetzung speichern</strong>.</li></ol><p>Diese Auswahl wird für Bibelvorschauen beim Überfahren einer Stelle und für <strong>Bibeltext einfügen</strong> in Dokumenten verwendet. Die Einstellung <strong>Automatisch</strong> überlässt die Wahl Akribos. Wo eine Vorschau ausdrücklich zu einer Quellbibel gehört, kann dieser Bezug maßgeblich sein.</p><p>Die Standardübersetzung ersetzt nicht automatisch die Bibeln deiner geöffneten Reader-Tabs. Um im Reader eine andere Bibel zu lesen, verwende dort <strong>Werk wechseln</strong> oder ergänze sie als neuen Tab.</p><p>Auch eine dir freigegebene private Bibel kann zur Auswahl stehen. Wird ihre Freigabe später aufgehoben, kannst du sie nicht mehr für neue Vorschauen oder Zitate verwenden. Wähle dann eine weiterhin verfügbare Ausgabe.</p>`
			},
			{
				id: 'was-wo',
				title: 'Welche Einstellung findest du wo?',
				html: `<table><thead><tr><th>Aufgabe</th><th>Ort</th></tr></thead><tbody><tr><td>Hell oder dunkel</td><td>Sonnen-/Mondsymbol im Kopfbereich oder unter Darstellung</td></tr><tr><td>Lesetext größer oder kleiner</td><td>A−/A+ im Reader oder unter Darstellung</td></tr><tr><td>Bibel für Vorschauen und Zitate</td><td>Darstellung → Standardübersetzung</td></tr><tr><td>Markierungsfarben benennen und Verse finden</td><td>Darstellung → Versmarkierungen</td></tr><tr><td>Bibel oder Kommentar im Reader öffnen</td><td>Pluszeichen oder Werk wechseln im jeweiligen Tab</td></tr><tr><td>Spalten, Zeilen und große Kacheln wählen</td><td>Kachelanordnung oben im Reader</td></tr><tr><td>Eine Studienansicht wiederverwenden</td><td>Arbeitsbereiche</td></tr></tbody></table><p>Weitere Schritte findest du unter <a href="/help/verse/kopieren-markieren-und-wiederfinden#farben">Markierungsfarben verwalten</a> und <a href="/help/reader/werke-tabs-und-layouts">Werke und Kacheln anordnen</a>.</p>`
			},
			{
				id: 'fragen',
				title: 'Wenn die Darstellung anders als erwartet aussieht',
				html: `<details><summary>Nach einem Gerätewechsel ist die Schriftgröße anders.</summary><p>Ein Gerät mit vorhandener eigener Einstellung behält diese. Passe die Größe direkt auf diesem Gerät an. Die Änderungen sollen nicht bei jedem Besuch andere Geräte umstellen.</p></details><details><summary>Die Standardübersetzung wurde gespeichert, aber der Reader zeigt die alte Bibel.</summary><p>Die Standardübersetzung steuert Vorschauen und eingefügte Zitate. Der Reader behält seine geöffneten Werke. Wechsle dort den betreffenden Tab oder öffne die neue Bibel zusätzlich.</p></details><details><summary>Meine Gast-Einstellung ist nach dem Schließen verschwunden.</summary><p>Der Browser muss die Einstellungen für die Seite behalten können. Private Fenster oder das Löschen der Website-Daten können sie entfernen. Stelle die Ansicht bei Bedarf erneut ein.</p></details><details><summary>Ich finde keine Liste offener Reader-Werke in den Einstellungen.</summary><p>Die Werke verwaltest du direkt in den Reader-Tabs. Die Seite „Darstellung“ dient der Leseschrift, dem Design, der Standardübersetzung und deinen Markierungsfarben.</p></details>`
			}
		]
	},
	{
		id: 'auf-smartphone-und-tablet-lesen',
		topic: 'mobil',
		path: '/help/mobil/auf-smartphone-und-tablet-lesen',
		title: 'Auf Smartphone und Tablet weiterstudieren',
		description:
			'Nutze die gemeinsame Tab-Leiste, wechsle zwischen Bibel und Lexikon und öffne deine gespeicherten Arbeitsbereiche auf einem weiteren Gerät.',
		icon: 'maximize',
		audience: 'user',
		level: 'guide',
		keywords: [
			'Mobil',
			'Smartphone',
			'Tablet',
			'Touch',
			'Tab-Leiste',
			'E-Ink',
			'Gerätewechsel',
			'Hochformat',
			'Querformat',
			'Offline'
		],
		prerequisite:
			'Ein Browser mit Internetverbindung. Für persönliche Arbeitsbereiche und Inhalte melde dich mit demselben Konto wie am Computer an.',
		sections: [
			{
				id: 'schnellstart',
				title: 'In der mobilen Ansicht beginnen',
				html: `<ol><li>Öffne <a href="/">den Reader</a> im Browser deines Geräts.</li><li>Tippe in der Tab-Leiste auf die Bibel, die du lesen möchtest.</li><li>Gib im Stellenfeld zum Beispiel <code>Joh 1</code> ein und bestätige über deine Bildschirmtastatur.</li><li>Scrolle im Bibeltext. Für ein anderes Werk tippst du auf dessen Tabnamen.</li></ol>`,
				screenshot: {
					src: '/help/live/reader-mobile.webp',
					width: 390,
					height: 844,
					portrait: true,
					alt: 'Reader auf einem Smartphone mit gemeinsamer Tab-Leiste, Stellenfeld und Johannes 1.',
					caption:
						'Die Tabs aller Kacheln sind in einer Leiste zusammengefasst. Du liest jeweils das ausgewählte Werk.'
				}
			},
			{
				id: 'tabs',
				title: 'Alle Werke über eine Tab-Leiste erreichen',
				html: `<p>Auf schmalen Bildschirmen zeigt Akribos jeweils ein Werk. Die gemeinsame Leiste enthält die Tabs aus allen Kacheln deines Arbeitsbereichs. Bei vielen Tabs kannst du sie seitlich scrollen, um weitere Namen zu erreichen.</p><p>Das <strong>Pluszeichen</strong> ergänzt ein Werk im Bereich des aktuell ausgewählten Tabs. Mit <strong>Werk wechseln</strong> ersetzt du dessen Werk. Über das <strong>×</strong> am Tabnamen schließt du diesen Tab. Diese Aktionen ändern dieselbe gespeicherte Zusammenstellung, die du später am Computer öffnest.</p><p>Die mobile Ansicht hebt deine Desktop-Anordnung nicht auf. Auf einem breiteren Bildschirm können die Werke wieder in den gespeicherten Kacheln erscheinen. Das Drehen oder Vergrößern des Bildschirms allein erzeugt keinen neuen Arbeitsbereich.</p>`
			},
			{
				id: 'wortstudie-und-suche',
				title: 'Wortstudien und Suchergebnisse mobil verwenden',
				html: `<p>Tippe auf ein mit Strong verknüpftes Wort, um seine Wortstudie zu öffnen. Akribos aktiviert den passenden Lexikon-Tab. Um den Bibeltext weiterzulesen, wählst du dessen Tab in der Leiste erneut. Die Wortstudie bleibt erreichbar.</p><p>Für eine Textsuche gibst du den Suchbegriff im Bibel- oder Kommentar-Tab ein. Buchverteilung, Filter und Treffer erscheinen in demselben Tab. Das <strong>×</strong> der Suchergebnisse führt zurück zum Lesetext. Die Pfeile <strong>Zurück</strong> und <strong>Vor</strong> in der Werkzeugleiste gehören weiterhin zum jeweiligen Tab.</p><p>Auf schmalen Diagrammen stehen ausführliche Beschriftungen unter der Grafik, damit sie lesbar bleiben. Scrolle daher im Lexikon weiter nach unten, wenn die gesuchte Angabe nicht unmittelbar neben dem Diagramm steht.</p>`
			},
			{
				id: 'touch',
				title: 'Versaktionen, Fußnoten und Textgröße',
				html: `<p>Tippe für das Versmenü auf die <strong>Versnummer</strong>. Bei Vers 1 dient die große Kapitelzahl als Schaltfläche. Du kannst den Vers kopieren, markieren oder einer Sammlung hinzufügen. Ein Tipp auf ein verknüpftes Wort öffnet dagegen das Lexikon.</p><p>Fußnoten öffnest du über ihre kleine hochgestellte Marke. Tippe außerhalb, um einen geöffneten Hinweis zu schließen. Zum normalen Auswählen und Kopieren von Text kannst du die Textauswahl deines Geräts verwenden; daraus entsteht keine farbige Versmarkierung.</p><p>Die Schaltflächen A− und A+ sind im schmalen Kopfbereich ausgeblendet. Angemeldet erreichst du die Textgröße über <strong>Mein Konto → Darstellung</strong>. Das Sonnen-/Mondsymbol im Kopfbereich wechselt weiterhin direkt das Design.</p>`
			},
			{
				id: 'geraetewechsel',
				title: 'Einen Arbeitsbereich vom Computer öffnen',
				html: `<ol><li>Melde dich auf dem Mobilgerät mit derselben E-Mail-Adresse wie am Computer an.</li><li>Öffne oben im Reader <strong>Arbeitsbereiche</strong>.</li><li>Wähle den gewünschten gespeicherten Namen.</li><li>Wechsle über die mobile Tab-Leiste zwischen den übernommenen Werken und Suchen.</li></ol><p>Benannte Arbeitsbereiche sind an dein Konto gebunden. Jeder Browser-Tab merkt sich getrennt, welchen Arbeitsbereich und welche Leseansicht du geöffnet hast. Ein Wechsel in einem Tab ändert die Auswahl in einem anderen Tab oder auf deinem Smartphone nicht. Auch die Lesestelle wird beim Scrollen automatisch gespeichert. Bereits offene Ansichten bleiben an ihrer Stelle. Klicke im Menü erneut auf den aktiven Arbeitsbereich, um den zuletzt gespeicherten Stand eines anderen Tabs oder Geräts zu laden. Die Textgröße und das Design können für dein Mobilgerät anders bleiben. Der schrittweise Vor-/Zurück-Verlauf eines Tabs wird beim Gerätewechsel nicht übertragen.</p><p>Wenn du nur eine bestimmte Stelle auf dem anderen Gerät öffnen möchtest, verwende einen Verslink. Für eine Zusammenstellung mit geöffneten Werken und Suchen kannst du die Reader-Adresse kopieren. Der Empfänger benötigt weiterhin eigene Berechtigungen für private Werke.</p>`
			},
			{
				id: 'verbindung-und-eink',
				title: 'Verbindung und besondere Lesegeräte',
				html: `<p>Akribos arbeitet im Browser und lädt Kapitel, Suchen und persönliche Änderungen über die Internetverbindung. Bereits sichtbarer Text kann bei einer Unterbrechung noch lesbar sein; weitere Kapitel und neue Suchergebnisse benötigen jedoch eine Verbindung. Eine vollständige Offline-Bibliothek zum Herunterladen bietet diese Oberfläche nicht.</p><p>Auf E-Ink-Geräten kann die Anwendung eine vereinfachte, kontrastreichere Darstellung verwenden, wenn der Browser ein langsames oder monochromes Display meldet. Das Aussehen und die Bedienbarkeit hängen auch vom eingebauten Browser ab. Öffne zum Einstieg eine einzelne Kachel und passe die Schriftgröße für dein Gerät an.</p><p>Wenn beim Nachladen nichts erscheint, prüfe zuerst die Verbindung. Für weitere Hilfe siehe <a href="/help/probleme">Probleme lösen</a>.</p>`
			}
		]
	}
];
