import type { HelpArticle, HelpScreenshot } from '../types';

const notesScreenshot: HelpScreenshot = {
	src: '/help/live/notes-editor.webp',
	width: 1440,
	height: 1000,
	alt: 'Johannes 1 im Reader mit der geöffneten privaten Notiz Das Wort wurde Mensch neben dem Bibeltext.',
	caption:
		'Bibeltext und eigene Gedanken bleiben zusammen sichtbar. Die Notiz gehört zur persönlichen Bibliothek und lässt sich auch als vollständige Dokumentseite öffnen.'
};
const boardScreenshot: HelpScreenshot = {
	src: '/help/live/sermon-board.webp',
	width: 1440,
	height: 1000,
	alt: 'Vorbereitungsboard mit Ausarbeitungen zu Johannes, verteilt auf die Arbeitsstände Idee, Recherche, Gliederung und Bereit.',
	caption:
		'Jede Karte ist eine eigene Ausarbeitung. Die Spalte zeigt den Arbeitsstand; Format, Reihe und Termin helfen bei der Planung.'
};
const collectionScreenshot: HelpScreenshot = {
	src: '/help/live/verse-collection.webp',
	width: 1440,
	height: 1000,
	alt: 'Private Stellensammlung Licht und Leben mit vier Versen aus dem Johannesevangelium.',
	caption:
		'Eine Stellensammlung hält einzelne Verse zu deinem Thema zusammen. An jedem Vers können eigene Kommentare und Gespräche entstehen.'
};

const libraryScreenshot: HelpScreenshot = {
	src: '/help/live/notes-library.webp',
	width: 1440,
	height: 1000,
	alt: 'Notizbibliothek mit drei privaten Beispieldokumenten, Schlagwortbaum, Such- und Bibelstellenfiltern.',
	caption:
		'Die Bibliothek verbindet Titel- und Inhaltssuche mit Schlagwörtern, Bibelstellen und einer Übersicht nach Bibelbuch.'
};
const editorScreenshot: HelpScreenshot = {
	src: '/help/live/editor-overview.webp',
	width: 1440,
	height: 1000,
	alt: 'Vollständiger Dokumenteditor mit Titel, Werkzeugleiste, Text und den ergänzenden Dokumentangaben.',
	caption:
		'Auf der vollständigen Dokumentseite stehen Schreiben und ergänzende Angaben zusammen bereit.'
};

/** User workflows checked against the document, preparation and collection interfaces. */
export const documentGuides: HelpArticle[] = [
	{
		id: 'notizen-organisieren',
		topic: 'dokumente',
		path: '/help/dokumente/notizen-organisieren',
		title: 'Notizen anlegen, ordnen und wiederfinden',
		description:
			'Halte Beobachtungen fest und finde sie mit Schlagwörtern, Bibelstellen, Buchübersicht und Suche wieder. Mit Kachelansicht, Listenansicht und Papierkorb.',
		icon: 'file-text',
		audience: 'user',
		level: 'guide',
		prerequisite: 'Du bist angemeldet. Deine Notizen gehören zu deinem eigenen Konto.',
		keywords: [
			'Notizen',
			'Bibliothek',
			'Schlagwörter',
			'Tags',
			'Filter',
			'Bibelstellen',
			'Papierkorb',
			'Wiederherstellen',
			'Listenansicht',
			'Kachelansicht'
		],
		sections: [
			{
				id: 'schritte',
				title: 'In wenigen Schritten zur ersten Notiz',
				html: `<ol><li>Öffne im Kontomenü <strong>Notizen &amp; Ausarbeitungen</strong> und wähle den Bereich <strong>Notizen</strong>.</li><li>Wähle <strong>Neue Notiz</strong>.</li><li>Gib einen aussagekräftigen Titel ein, zum Beispiel „Licht und Leben in Johannes 1“, und schreibe deine Beobachtung in den Textbereich.</li><li>Warte auf <strong>Gespeichert</strong>. Titel und Text werden automatisch gespeichert.</li><li>Trage im Bereich <strong>Schlagwörter</strong> beispielsweise <code>Johannes/Licht, Persönliches Studium</code> ein und wähle <strong>Schlagwörter speichern</strong>.</li><li>Gehe über <strong>Zur Notizbibliothek</strong> zurück. Öffne die Notiz später über ihre Karte oder finde sie mit der Suche.</li></ol><p>Für eine Notiz direkt beim Lesen öffnest du das Versmenü über die Versnummer und wählst die Notizfunktion. So entsteht der Gedanke gleich an seiner Bibelstelle. Die <a href="/help/verse">Hilfe zum Versmenü</a> erklärt den Einstieg aus dem Reader.</p>`,
				screenshot: libraryScreenshot
			},
			{
				id: 'bibliothek',
				title: 'Die drei Dokumentbereiche verstehen',
				html: `<dl class="definition-list"><div><dt>Notizen</dt><dd>Deine persönlichen Gedanken, Beobachtungen und Textstudien. Hier findest du Suche, Schlagwortbaum und die Verteilung nach Bibelbuch.</dd></div><div><dt>Ausarbeitungen</dt><dd>Der Bereich für geplante Hauskreise, Predigten und andere Vorbereitungen. Die Seite trägt die Überschrift „Vorbereitung“ und zeigt ein Board mit Arbeitsständen.</dd></div><div><dt>Stellensammlungen</dt><dd>Zusammenstellungen einzelner Verse mit Kommentaren und optionaler Zusammenarbeit.</dd></div></dl><p>Die drei Reiter gehören zusammen, zeigen aber jeweils ihre eigenen Inhalte. Eine in eine Ausarbeitung umgewandelte Notiz findest du deshalb unter <strong>Ausarbeitungen</strong>. Mehr dazu: <a href="/help/predigten/ausarbeitung-planen">Eine Ausarbeitung planen</a>.</p><p>Der Name und der Text einer Notiz werden beim Schreiben automatisch gesichert. Schlagwörter und Bibelstellen haben eigene Schaltflächen zum Übernehmen ihrer Änderungen.</p>`
			},
			{
				id: 'suche-filter',
				title: 'Suche und Filter gezielt kombinieren',
				html: `<ol><li>Gib in <strong>Dokumente durchsuchen …</strong> ein Wort aus Titel oder Inhalt ein.</li><li>Ergänze bei Bedarf eine Stelle unter <strong>Mit Bibelstelle überschneidend</strong>, etwa <code>Joh 1,1-18</code>.</li><li>Wähle einen <strong>Übersetzungsbezug</strong> und ein <strong>Erstellungsjahr</strong>, wenn du die Auswahl weiter einschränken möchtest.</li><li>Bestätige mit <strong>Suchen</strong>.</li></ol><p>Die Filter werden gemeinsam angewendet. „Erstellungsjahr“ bezieht sich auf die Anlage der Notiz, nicht auf ihre letzte Bearbeitung. Der Stellenfilter berücksichtigt passende Verknüpfungen und erkannte Bibelstellen im Notiztext. Auch eine längere, überlappende Stelle kann deshalb passen.</p><p><strong>Alle</strong> lässt den Übersetzungsbezug offen. <strong>Für alle Übersetzungen</strong> bezeichnet allgemeine Verknüpfungen; eine bestimmte Bibel schränkt übersetzungsbezogene Verknüpfungen ein. Erkannte Bibelstellen im normalen Text bleiben stellenbezogen.</p><p>Die Übersicht <strong>Notizen nach Bibelbuch</strong> zeigt, auf welche Bücher sich die gefilterten Notizen beziehen. Wähle ein Buch, um passende Notizen zu sehen; mit <strong>Buchfilter aufheben</strong> kehrst du zur vorherigen Auswahl zurück. Eine Notiz kann zu mehreren Büchern gehören. Mehrere Stellen desselben Buchs zählen sie dort nur einmal.</p><p>Über <strong>Kachelansicht</strong> und <strong>Listenansicht</strong> änderst du die Darstellung. Bei vielen Treffern blätterst du mit <strong>Zurück</strong> und <strong>Weiter</strong> durch die Ergebnisse.</p>`
			},
			{
				id: 'schlagwoerter',
				title: 'Mit verschachtelten Schlagwörtern arbeiten',
				html: `<p>Schlagwörter verbinden verwandte Notizen, ohne dass du jede Notiz in einen einzigen Ordner einsortieren musst. Trenne mehrere Begriffe im Eingabefeld durch Kommas. Ein Schrägstrich bildet eine Untergruppe: <code>Theologie/Gnade</code> gehört unter „Theologie“.</p><ol><li>Öffne die vollständige Notizseite.</li><li>Bearbeite im Bereich <strong>Schlagwörter</strong> die gesamte gewünschte Auswahl.</li><li>Wähle <strong>Schlagwörter speichern</strong>. Ein aus dem Feld entfernter Begriff wird von dieser Notiz gelöst.</li><li>Zurück in der Bibliothek kannst du Gruppen mit dem Pfeil aufklappen und ein Schlagwort als Filter wählen.</li></ol><p>Mit <strong>Schlagwörter suchen</strong> suchst du im Schlagwortbaum. Ein Klick auf einen gefundenen Begriff filtert anschließend die Notizen. <strong>Alle</strong> im Baum hebt den Schlagwortfilter auf. Andere gesetzte Filter bleiben bestehen.</p><p>Wähle kurze, beständige Begriffe. Eine mögliche Ordnung ist „Bibel/Johannes“, „Theologie/Gnade“ und „Fragen/Offen“. Pro Dokument sind bis zu 50 Schlagwörter und bis zu acht Ebenen möglich.</p>`
			},
			{
				id: 'bibelstellen',
				title: 'Eine Notiz bewusst mit Bibelstellen verknüpfen',
				html: `<ol><li>Öffne auf der Dokumentseite den Bereich <strong>Bibelstellen</strong>.</li><li>Gib eine Stelle oder einen Abschnitt ein, etwa <code>Joh 1,14</code>, <code>Joh 1,1-18</code> oder <code>1Mo 1,31-2,3</code>.</li><li>Lasse <strong>Für alle Übersetzungen</strong> ausgewählt, wenn die Beobachtung allgemein zum Abschnitt gehört. Wähle eine bestimmte Übersetzung, wenn sie deren besondere Wortwahl betrifft.</li><li>Bestätige mit <strong>Bibelstelle hinzufügen</strong>.</li></ol><p>Du kannst derselben Notiz mehrere Stellen zuordnen. Ein Klick auf eine eingetragene Referenz öffnet den Bibeltext. Das Kreuz <strong>Bibelstelle entfernen</strong> löst diese Zuordnung; die Notiz bleibt erhalten.</p><p>Eine geschriebene Referenz wie „Joh 1,14“ im Text ist ebenfalls nützlich: Akribos erkennt sie für Vorschau, Navigation und die Bibliothek. Die ausdrücklich hinzugefügten Bibelstellen halten zusätzlich fest, zu welchem Abschnitt und gegebenenfalls zu welcher Übersetzung du die gesamte Notiz einordnest.</p>`
			},
			{
				id: 'papierkorb',
				title: 'Notizen entfernen und wiederherstellen',
				html: `<ol><li>Gehe zur Notizbibliothek.</li><li>Wähle an der betreffenden Karte oder Zeile <strong>In den Papierkorb</strong>. Am Computer erscheint die Schaltfläche beim Darüberfahren oder beim Fokussieren mit der Tastatur.</li><li>Bestätige die Rückfrage.</li></ol><p>Um die Notiz zurückzuholen, öffne links <strong>Papierkorb</strong> und wähle an ihrem Eintrag <strong>Dokument wiederherstellen</strong>. Öffne danach wieder die aktiven Notizen. Die vorhandenen Such- und Schlagwortfilter gelten auch im Papierkorb; setze sie zurück, wenn du einen Eintrag vermisst.</p><p>Die Bibliothek bietet das Verschieben und Wiederherstellen an. Eine Stellensammlung verwendet einen eigenen Löschvorgang: Dort werden die Sammlung und ihre Kommentare gelöscht.</p>`
			},
			{
				id: 'fragen-mobil',
				title: 'Mobil arbeiten und fehlende Notizen finden',
				html: `<p>Auf dem Smartphone stehen die drei Dokumentbereiche weiterhin oben zur Verfügung. Schlagwörter und Filter liegen vor der Ergebnisliste; scrolle bei Bedarf dorthin zurück. Zum längeren Schreiben kannst du die Notiz auf ihrer eigenen Seite oder im <a href="/help/dokumente/editor-bedienen#zen">Zen-Modus</a> öffnen.</p><details><summary>Meine Notiz ist verschwunden. Wo suche ich zuerst?</summary><p>Öffne <a href="/notes">Notizen</a> ohne zusätzliche Filter. Prüfe danach den Papierkorb und den Bereich „Ausarbeitungen“, falls du den Dokumenttyp geändert hast. Achte außerdem darauf, mit dem richtigen Konto angemeldet zu sein.</p></details><details><summary>Warum passt der Buchfilter ohne hinzugefügte Bibelstelle?</summary><p>Akribos berücksichtigt auch erkannte Bibelstellen im geschriebenen Text. Du musst deshalb nicht jeden Verweis zusätzlich als eigene Zuordnung eintragen.</p></details><details><summary>Können andere meine Notizen lesen?</summary><p>Deine Arbeitskopien sind privat. Ein gewöhnlicher Link auf deine Notizseite erteilt anderen keinen Zugriff. Wenn du eine Notiz weitergeben möchtest, kannst du sie über den <a href="/help/import-export/dokumente-exportieren">Dokumentexport</a> als Datei herunterladen. Für gemeinsames Sammeln und Besprechen nutze <a href="/help/listen/gemeinsam-arbeiten">Stellensammlungen</a>.</p></details>`
			}
		]
	},
	{
		id: 'editor-bedienen',
		topic: 'dokumente',
		path: '/help/dokumente/editor-bedienen',
		title: 'Im Editor schreiben und sicher speichern',
		description:
			'Formatiere Notizen und Ausarbeitungen, nutze Markdown, Befehle, Gliederung und Zen-Modus und erkenne den aktuellen Speicherstand.',
		icon: 'file-text',
		audience: 'user',
		level: 'guide',
		prerequisite: 'Eine eigene Notiz oder Ausarbeitung ist geöffnet.',
		keywords: [
			'Editor',
			'Visuell',
			'Markdown',
			'Formatieren',
			'Slash',
			'Befehle',
			'Zen',
			'Speichern',
			'Autosave',
			'Gliederung',
			'Rückgängig',
			'Fußnoten',
			'Quellenangaben'
		],
		sections: [
			{
				id: 'schritte',
				title: 'Einen gut lesbaren Text schreiben',
				html: `<ol><li>Trage oben den <strong>Titel</strong> ein.</li><li>Wähle <strong>Visuell</strong> und schreibe im großen Textfeld.</li><li>Setze den Cursor in eine Abschnittsüberschrift und wähle in der Werkzeugleiste <strong>Überschrift 2</strong>.</li><li>Markiere einen wichtigen Ausdruck und wähle <strong>Fett</strong> oder <strong>Hervorheben</strong>.</li><li>Öffne <strong>Inhalt und Verknüpfungen</strong>, um deine Überschriften als Gliederung zu sehen.</li><li>Warte vor dem Schließen auf <strong>Gespeichert</strong>.</li></ol><p>Notizen und Ausarbeitungen verwenden denselben Texteditor. Deine Gedanken können deshalb klein beginnen und später zu einer umfangreichen Vorbereitung wachsen.</p>`,
				screenshot: editorScreenshot
			},
			{
				id: 'formatieren',
				title: 'Die Werkzeugleiste und das Auswahlmenü',
				html: `<p>Die Werkzeugleiste formatiert entweder die markierten Wörter oder den Absatz, in dem der Cursor steht. Bereits aktive Formatierungen sind hervorgehoben. Beim Markieren von Text erscheint zusätzlich ein kompaktes Auswahlmenü nahe der Auswahl.</p><dl class="definition-list"><div><dt>Wörter hervorheben</dt><dd>Fett, Kursiv, Durchgestrichen, Unterstreichen und Hervorheben lassen sich auf eine Textauswahl anwenden und wieder ausschalten.</dd></div><div><dt>Absätze gliedern</dt><dd>Die Auswahl „Absatz“ beziehungsweise „Überschrift“ bietet normalen Fließtext und Überschriften der Ebenen 1 bis 6.</dd></div><div><dt>Gedanken ordnen</dt><dd>Aufzählung und Nummerierte Liste bilden Listen; Zitat setzt einen Absatz als Zitatblock ab.</dd></div><div><dt>Code und Links</dt><dd>Code kennzeichnet einen kurzen Ausdruck als vorformatierten Text. Link bearbeiten verbindet Text mit einer Webadresse oder einem internen Ziel.</dd></div><div><dt>Änderungen zurücknehmen</dt><dd>Rückgängig und Wiederholen bewegen sich durch die Bearbeitungsschritte der laufenden Editorsitzung.</dd></div></dl><p>Für einen mehrzeiligen Codeblock oder eine Trennlinie nutze das Befehlsmenü. Rückgängig hilft beim aktuellen Schreiben; ein dauerhaft abrufbares Archiv älterer Textfassungen gibt es in dieser Oberfläche nicht.</p>`,
				screenshot: {
					src: '/help/live/editor-toolbar.webp',
					width: 890,
					height: 54,
					alt: 'Detail der Editor-Werkzeugleiste mit Textformatierung, Überschriftenauswahl, Listen, Zitat und Rückgängig.',
					caption:
						'Die Werkzeugleiste formatiert markierte Wörter oder den aktuellen Absatz. Die Bezeichnungen sind auch über die Tastatur erreichbar.'
				}
			},
			{
				id: 'fussnoten',
				title: 'Quellen und Anmerkungen als Fußnoten ergänzen',
				html: `<ol><li>Setze den Cursor im Text an die Stelle, an der der Verweis stehen soll.</li><li>Wähle <strong>Fußnote</strong> in der Werkzeugleiste. Auch <code>/fußnote</code> oder <kbd>Strg</kbd>/<kbd>Cmd</kbd> + <kbd>Alt</kbd> + <kbd>F</kbd> fügt eine Fußnote ein.</li><li>Schreibe die Anmerkung im neuen Fußnotenabsatz am Dokumentende. Fett, Kursiv, Absätze und Links sind dort ebenfalls möglich.</li><li>Mit <strong>Zur Textstelle</strong> kehrst du zum Verweis zurück.</li></ol><p>Akribos nummeriert Fußnoten nach ihrem ersten Auftreten. Über <strong>Erneut verweisen …</strong> kannst du dieselbe Anmerkung an einer weiteren Textstelle verwenden. Die Nummer passt sich automatisch an, wenn sich die Reihenfolge ändert.</p><p>Zum Löschen wähle am Verweis <strong>Verweis entfernen</strong> beziehungsweise bei der letzten Verwendung <strong>Fußnote entfernen</strong>. Löschst du einen Verweis mit der Tastatur, bleibt die Anmerkung zunächst erhalten und kann erneut zugeordnet werden. So geht ihr Text beim Bearbeiten nicht verloren.</p><p>In Markdown besteht eine Fußnote aus einem Verweis und einer Definition:</p><pre><code>Ein Gedanke mit einer Quelle.[^quelle]

[^quelle]: Eine Erklärung mit **Hervorhebung** und einem Link.</code></pre><p>Verwende für jede neue Anmerkung einen eindeutigen Namen. Mehrere Absätze einer Definition rückst du mit vier Leerzeichen ein. Eine leere neue Fußnote bleibt beim Speichern erhalten. In der Leseansicht führen die Nummer und der Rückverweis zwischen Text und Anmerkung hin und her.</p>`
			},
			{
				id: 'befehle',
				title: 'Mit dem Schrägstrich Inhalte einfügen',
				html: `<ol><li>Setze den Cursor im visuellen Editor an den Anfang eines Absatzes oder hinter ein Leerzeichen.</li><li>Tippe <code>/</code>. Das Menü <strong>Befehle</strong> öffnet sich.</li><li>Tippe weiter, um die Auswahl einzugrenzen, zum Beispiel <code>/liste</code>.</li><li>Wähle den gewünschten Befehl per Klick oder mit den Pfeiltasten und <kbd>Enter</kbd>. <kbd>Escape</kbd> schließt das Menü.</li></ol><p>Zur Auswahl stehen <strong>Text</strong>, <strong>Überschrift 1–3</strong>, <strong>Aufzählung</strong>, <strong>Nummerierte Liste</strong>, <strong>Zitat</strong>, <strong>Codeblock</strong>, <strong>Trennlinie</strong>, <strong>Fußnote</strong> und <strong>Bibeltext</strong>. „Bibeltext“ beginnt die Eingabe <code>/bibel </code>; ergänze danach die Stelle. Die <a href="/help/dokumente/bibeltexte-verknuepfungen">Anleitung zu Bibeltexten und Verknüpfungen</a> zeigt den vollständigen Ablauf.</p><p>Das Menü gehört zum visuellen Editor. Innerhalb von Code beziehungsweise Codeblöcken werden solche Befehle als Text behandelt.</p>`
			},
			{
				id: 'markdown',
				title: 'Zwischen Visuell und Markdown wechseln',
				html: `<p>Wähle oben <strong>Markdown</strong>, um den Text mit seiner Auszeichnung zu bearbeiten. Mit <strong>Visuell</strong> kehrst du zur formatierten Ansicht zurück. Beide Ansichten bearbeiten dasselbe Dokument.</p><pre><code>## Meine Beobachtung

**Wichtig:** Johannes spricht von Licht und Leben.

- Beobachtung am Text
- Offene Frage

&gt; Ein eingerückter Zitatabsatz

[Johannes 1 öffnen](/Joh1)</code></pre><p><code>**Text**</code> steht für fett, <code>*Text*</code> für kursiv, <code>##</code> für eine Überschrift zweiter Ebene und <code>-</code> für eine Aufzählung. Der Editor unterstützt eine begrenzte, portable Textauszeichnung. Medien, Einbettungen und beliebiges HTML gehören nicht zum Dokumenttext; Materialdateien kannst du an <a href="/help/predigten/vorlagen-materialien#anlagen">Ausarbeitungen als Anlagen</a> ablegen.</p><p><kbd>Strg</kbd>/<kbd>Cmd</kbd> + <kbd>M</kbd> wechselt den Modus, wenn der Fokus im Editor liegt. Die ausführliche Liste der Konvertierungsgrenzen steht unter <a href="/help/import-export/dokumente-importieren#konvertierung">Import und Konvertierung</a>.</p>`,
				screenshot: {
					src: '/help/live/editor-markdown.webp',
					width: 1440,
					height: 1000,
					alt: 'Markdown-Ansicht des vollständigen Dokumenteditors mit der Textauszeichnung einer Beispielnotiz.',
					caption:
						'Visuell und Markdown bearbeiten denselben Text. Hier siehst du Überschriften, Hervorhebungen und Verweise in ihrer Textauszeichnung.'
				}
			},
			{
				id: 'zen',
				title: 'Mit Gliederung und Zen-Modus den Überblick behalten',
				html: `<ol><li>Wähle <strong>Inhalt und Verknüpfungen</strong> neben dem Umschalter für Visuell und Markdown.</li><li>Öffne den Reiter <strong>Inhalt</strong>.</li><li>Wähle eine Überschrift, um zur entsprechenden Textstelle zu springen.</li></ol><p>Die Gliederung entsteht aus echten Überschriften. Ein lediglich fett geschriebener Absatz erscheint dort nicht. Der zweite Reiter <strong>Verknüpfungen</strong> zeigt Beziehungen zu anderen eigenen Dokumenten.</p><p>Mit <strong>Zen-Modus</strong> vergrößerst du den Schreibbereich. Dein Text und die laufende Bearbeitung bleiben erhalten. Über <strong>Zen-Modus beenden</strong> kehrst du zur normalen Ansicht zurück. Während du im Editor arbeitest, schaltet auch <kbd>Strg</kbd>/<kbd>Cmd</kbd> + <kbd>Shift</kbd> + <kbd>F</kbd> den Modus um.</p><p>Unter dem Text stehen Wort- und Zeichenzahl. Gezählt wird der Dokumenttext ohne Titel; Leerzeichen zählen bei den Zeichen mit. Auf einem Smartphone ist der Zen-Modus besonders hilfreich, wenn Tastatur, Text und Bedienelemente sonst wenig Platz haben.</p>`
			},
			{
				id: 'speichern',
				title: 'Den Speicherstatus richtig lesen',
				html: `<dl class="definition-list"><div><dt>Nicht gespeicherte Änderungen</dt><dd>Der Text wurde geändert und wartet noch auf die Speicherung.</dd></div><div><dt>Wird gespeichert …</dt><dd>Akribos überträgt den Text gerade.</dd></div><div><dt>Gespeichert</dt><dd>Die letzten Änderungen an Titel und Text sind übernommen.</dd></div><div><dt>Speichern fehlgeschlagen</dt><dd>Die Änderungen stehen noch im offenen Editor. Prüfe die Meldung, bevor du die Seite schließt.</dd></div></dl><p>Titel und Text speichern nach einer kurzen Schreibpause automatisch. <kbd>Strg</kbd>/<kbd>Cmd</kbd> + <kbd>S</kbd> stößt die Speicherung ausdrücklich an. Ein leerer Titel lässt sich nicht speichern.</p><p>Beim Wechsel zu einer anderen Akribos-Seite wartet der Editor auf ausstehende Textänderungen. Bei einem Speicherfehler bleibt der Wechsel aus. Lass den Editor bei Fehlern geöffnet und kopiere bei Bedarf deine Änderungen zunächst in eine lokale Textdatei.</p><details><summary>Meine Sitzung ist abgelaufen.</summary><p>Melde dich in einem weiteren Browser-Tab wieder an, während der Editor mit deinem Text geöffnet bleibt. Versuche danach im Editor erneut zu speichern. Kontrolliere „Gespeichert“, bevor du ihn schließt.</p></details><details><summary>Das Dokument wurde an anderer Stelle geändert.</summary><p>Ein anderer Tab oder ein anderes Gerät hat einen neueren Stand gespeichert. Kopiere deine noch offenen Änderungen, bevor du die Seite neu lädst. Vergleiche danach beide Fassungen und übernimm deine Ergänzungen bewusst. Akribos überschreibt den neueren Stand nicht automatisch.</p></details><details><summary>Warum ist mein Kommentar noch nicht gespeichert?</summary><p>Kommentare in Stellensammlungen verwenden einen anderen, kleineren Editor. Dort bestätigst du ausdrücklich mit „Speichern“. Die automatische Textspeicherung dieser Anleitung betrifft eigene Notizen und Ausarbeitungen.</p></details>`
			}
		]
	},
	{
		id: 'bibeltexte-verknuepfungen',
		topic: 'dokumente',
		path: '/help/dokumente/bibeltexte-verknuepfungen',
		title: 'Bibeltexte zitieren und eigene Gedanken verknüpfen',
		description:
			'Füge Bibelzitate ein, öffne Stellen aus deinem Text und verbinde Notizen mit @-Verweisen, Links und Rückverweisen.',
		icon: 'book-open',
		audience: 'user',
		level: 'guide',
		prerequisite: 'Eine eigene Notiz oder Ausarbeitung ist im visuellen Editor geöffnet.',
		keywords: [
			'Bibelzitat',
			'Bibeltext',
			'bibel',
			'stelle',
			'@',
			'Verknüpfungen',
			'Backlinks',
			'Rückverweise',
			'Links',
			'Im Arbeitsbereich öffnen'
		],
		sections: [
			{
				id: 'schritte',
				title: 'Ein Zitat und eine weiterführende Notiz einfügen',
				html: `<ol><li>Beginne im visuellen Editor einen neuen Absatz.</li><li>Tippe <code>/bibel Joh 1,14</code> und drücke <kbd>Enter</kbd>.</li><li>Akribos fügt den Bibeltext mit Stellenangabe und Übersetzungsbezeichnung als Zitat ein. Ergänze darunter deine Beobachtung.</li><li>Tippe in einem weiteren Absatz <code>@</code> und einige Wörter aus dem Titel einer anderen eigenen Notiz.</li><li>Wähle den passenden Beitrag aus <strong>Eigene Beiträge</strong>. Sein Titel wird als Link eingefügt.</li><li>Öffne <strong>Inhalt und Verknüpfungen → Verknüpfungen</strong>, um die Verbindung nach dem Speichern zu sehen.</li></ol>`,
				screenshot: editorScreenshot
			},
			{
				id: 'bibelzitate',
				title: 'Bibeltext mit Herkunft einfügen',
				html: `<p>Der Befehl <code>/bibel</code> benötigt eine gültige Stelle. Auch <code>/stelle Joh 1,1-5</code> wird erkannt. Nach <kbd>Enter</kbd> erscheint ein Zitatblock mit dem Text und einer Zeile für Stelle und Übersetzung. Über das <code>/</code>-Menü kannst du stattdessen zuerst <strong>Bibeltext</strong> auswählen und danach die Referenz ergänzen.</p><p>Die verwendete Übersetzung richtet sich zuerst nach deiner <strong>Standardübersetzung</strong>. Wähle sie bei Bedarf unter <strong>Darstellung → Standardübersetzung</strong> und bestätige mit <strong>Standardübersetzung speichern</strong>. Bei „Automatisch“ verwendet der Notizbereich im Reader die erste sichtbare Bibel; auf der vollständigen Dokumentseite gilt die automatisch gewählte Vorschau-Bibel. Prüfe die eingefügte Quellenzeile. Das bloße Öffnen einer anderen Bibel ändert eine ausdrücklich gesetzte Standardübersetzung nicht.</p><p>Erkannte Stellen im Text bieten außerdem eine Bibelvorschau. Dort kannst du <strong>Bibeltext einfügen</strong> nutzen. Eine Referenz allein verweist zum Text; das eingefügte Zitat hält den Wortlaut in deinem Dokument fest.</p><details><summary>Der Bibeltext konnte nicht geladen werden.</summary><p>Prüfe die Referenz und die verfügbare Übersetzung. Manche Werke enthalten nur einen Teil der Bibel. Öffne die Stelle im Reader, wähle eine geeignete Bibel und versuche es erneut.</p></details>`
			},
			{
				id: 'stellen-oeffnen',
				title: 'Bibelstellen aus dem Dokument im Arbeitsbereich lesen',
				html: `<p>Schreibe eine Stelle wie <code>Joh 1,14</code> in normalen Fließtext. Akribos erkennt den Verweis, sodass du den Bibeltext ansehen und über <strong>Bibelstelle öffnen</strong> zum Lesen wechseln kannst. Der sichtbare Befehl ist ohne besondere Tastenkombination nutzbar.</p><p><strong>Im Arbeitsbereich öffnen</strong> oben auf der vollständigen Dokumentseite öffnet dein Dokument neben dem Reader. So kannst du lesen und weiterarbeiten. Der Rückweg auf der Dokumentseite lautet je nach Einstieg <strong>Zurück zum Bibeltext</strong>, <strong>Zur Notizbibliothek</strong> oder <strong>Zur Vorbereitung</strong>.</p><p>Auf dem Smartphone ist weniger Platz nebeneinander vorhanden. Öffne die benötigte Stelle bewusst, nutze den Rückweg zum Dokument und kontrolliere bei längeren Eingaben den Speicherstatus. Für eine dauerhafte Zuordnung des ganzen Dokuments nutze den Bereich <a href="/help/dokumente/notizen-organisieren#bibelstellen">Bibelstellen</a>.</p>`
			},
			{
				id: 'erwaehnungen',
				title: 'Eigene Beiträge mit @ verbinden',
				html: `<ol><li>Tippe im visuellen Text am Absatzanfang oder hinter einem Leerzeichen <code>@</code>.</li><li>Ergänze einen Teil des gesuchten Titels.</li><li>Wähle einen Treffer mit der Maus oder mit den Pfeiltasten und <kbd>Enter</kbd>. <kbd>Escape</kbd> schließt die Vorschläge.</li></ol><p>Die Auswahl enthält eigene Notizen und Ausarbeitungen. Es wird ein normaler Link mit dem Titel des Zielbeitrags eingefügt. Du kannst den Linktext anschließend in deinen Satz einpassen.</p><p>Eine Erwähnung erteilt niemandem Zugriff auf das verknüpfte Dokument. Deine private Dokumentadresse bleibt für dein Konto bestimmt.</p>`
			},
			{
				id: 'rueckverweise',
				title: 'Verweise und Rückverweise nachvollziehen',
				html: `<p>Unter <strong>Inhalt und Verknüpfungen → Verknüpfungen</strong> findest du zwei Richtungen:</p><dl class="definition-list"><div><dt>Verweist auf</dt><dd>Eigene Dokumente, auf die der gerade geöffnete Text verlinkt.</dd></div><div><dt>Hier erwähnt</dt><dd>Andere eigene Dokumente, die den gerade geöffneten Beitrag verlinken.</dd></div></dl><p>Beide Listen helfen dir, eine Beobachtung in mehreren Studien weiterzuverwenden. Beispielsweise kann „Licht und Leben“ in einer persönlichen Textstudie und in einer Hauskreisvorbereitung erwähnt sein.</p><p>Warte nach dem Einfügen eines Links auf die Speicherung, damit die Beziehungen aktualisiert werden. <strong>Im Papierkorb</strong> weist auf einen entfernten Zielbeitrag hin; stelle ihn bei Bedarf in der Bibliothek wieder her. Eine leere Liste bedeutet, dass noch keine entsprechenden Beitragsverknüpfungen vorhanden sind.</p>`
			},
			{
				id: 'web-links',
				title: 'Webseiten und andere Ziele verlinken',
				html: `<ol><li>Markiere den Text, der als Link dienen soll.</li><li>Wähle <strong>Link bearbeiten</strong> in der Werkzeugleiste oder im Auswahlmenü.</li><li>Trage unter <strong>Linkziel</strong> die vollständige Webadresse ein. Auch eine E-Mail-Verknüpfung oder ein interner Pfad wie <code>/Joh3,16</code> ist möglich.</li><li>Bestätige mit <strong>Übernehmen</strong>.</li></ol><p>Um ein Ziel zu ändern, setze den Cursor in den Link und öffne <strong>Link bearbeiten</strong> erneut. <strong>Link entfernen</strong> erhält den Text und löst die Verknüpfung. <strong>Abbrechen</strong> schließt die Eingabe ohne Übernahme.</p><p>Während des Schreibens soll ein versehentlicher Klick dich nicht aus dem Text führen. Zum Aufrufen eines Links benutze <strong>Link öffnen</strong>. Mit <kbd>Strg</kbd>/<kbd>Cmd</kbd> + <kbd>K</kbd> öffnest du die Linkbearbeitung. In Markdown entspricht ein Link dem Muster <code>[Beschriftung](https://beispiel.de)</code>.</p>`
			}
		]
	},
	{
		id: 'ausarbeitung-planen',
		topic: 'predigten',
		path: '/help/predigten/ausarbeitung-planen',
		title: 'Eine Ausarbeitung vom ersten Gedanken bis zum Termin planen',
		description:
			'Bereite Hauskreis, Predigt oder Bibelstunde vor. Lege Format, Reihe und Termin fest und organisiere deine Entwürfe auf einem eigenen Board.',
		icon: 'calendar',
		audience: 'user',
		level: 'guide',
		prerequisite: 'Du bist angemeldet. Das Vorbereitungsboard gehört zu deinem eigenen Konto.',
		keywords: [
			'Ausarbeitung',
			'Vorbereitung',
			'Predigt',
			'Hauskreis',
			'Bibelstunde',
			'Board',
			'Spalten',
			'Arbeitsstand',
			'Format',
			'Reihe',
			'Termin',
			'Umwandeln'
		],
		sections: [
			{
				id: 'schritte',
				title: 'Eine Vorbereitung beginnen',
				html: `<ol><li>Öffne <strong>Notizen &amp; Ausarbeitungen → Ausarbeitungen</strong>. Die Seite <strong>Vorbereitung</strong> erscheint.</li><li>Trage unter <strong>Ausarbeitung aus Vorlage erstellen</strong> einen Titel und bei Bedarf eine <strong>Bibelstelle</strong> ein.</li><li>Wähle das passende <strong>Format</strong>, zum Beispiel „Hauskreis“ oder „Predigt“.</li><li>Ergänze optional <strong>Reihe</strong> und <strong>Geplanter Termin</strong>. Den Termin gibst du als <code>TT.MM.JJJJ</code> ein.</li><li>Wähle eine <strong>Vorlage</strong> und bestätige mit <strong>Erstellen</strong>.</li><li>Schreibe deine Ausarbeitung. Über <strong>Zur Vorbereitung</strong> gelangst du zum Board zurück.</li></ol><p>Die neue Ausarbeitung startet in der ersten Spalte deines Boards. Aus einer kurzen persönlichen Beobachtung kann so eine Vorbereitung mit Text, Material und Termin entstehen.</p>`,
				screenshot: boardScreenshot
			},
			{
				id: 'formate-planung',
				title: 'Format, Reihe und Termin unterscheiden',
				html: `<dl class="definition-list"><div><dt>Format</dt><dd>Beschreibt den Anlass: Predigt, Hauskreis, Bibelstunde, Jugendstunde, Kinderstunde oder Sonstiges.</dd></div><div><dt>Reihe</dt><dd>Verbindet mehrere Ausarbeitungen, etwa „Johannes entdecken“. Du gibst den Namen selbst ein.</dd></div><div><dt>Geplanter Termin</dt><dd>Hält fest, wann du diese Ausarbeitung voraussichtlich verwenden möchtest.</dd></div><div><dt>Arbeitsstand</dt><dd>Zeigt den Fortschritt beim Vorbereiten. Er entspricht einer Spalte auf dem Board.</dd></div></dl><p>Öffne eine Ausarbeitung, ändere diese Angaben im Bereich <strong>Arbeitsstand</strong> und wähle <strong>Arbeitsstand speichern</strong>. Titel und Fließtext speichern automatisch; die Planungsfelder übernimmst du mit dieser Schaltfläche.</p><p>Ein geplanter Termin ist noch kein Eintrag darüber, dass die Ausarbeitung bereits gehalten wurde. Tatsächliche Durchführungen trägst du gesondert mit Datum und Ort ein; siehe <a href="/help/predigten/vorlagen-materialien#durchfuehrungen">Durchführungen festhalten</a>.</p>`,
				screenshot: {
					src: '/help/live/preparation-details.webp',
					width: 320,
					height: 376,
					alt: 'Planungsfelder einer Hauskreis-Ausarbeitung mit Arbeitsstand Gliederung, Termin 07.10.2026 und Reihe Johannes entdecken.',
					caption:
						'Format beschreibt den Anlass, Arbeitsstand deinen Fortschritt. Termin und Reihe ergänzt du nach Bedarf und übernimmst die Angaben mit Arbeitsstand speichern.'
				}
			},
			{
				id: 'board',
				title: 'Den Arbeitsstand auf dem Board ändern',
				html: `<p>Das Board beginnt mit <strong>Idee</strong>, <strong>Recherche</strong>, <strong>Gliederung</strong>, <strong>Bereit</strong> und <strong>Gehalten</strong>. Jede Karte zeigt Titel, einen Textausschnitt und vorhandene Planungsangaben.</p><ol><li>Ziehe eine Karte in die gewünschte Spalte.</li><li>Warte, bis die Änderung gespeichert und die Karte dort angezeigt wird.</li><li>Klicke auf ihren Titel, um weiterzuschreiben.</li></ol><p>Alternativ öffnest du die Ausarbeitung und änderst den <strong>Arbeitsstand</strong> über die Auswahl auf ihrer Dokumentseite. Dieser Weg ist auch auf kleinen Bildschirmen gut erreichbar.</p><p>Mit der Tastatur kannst du eine Karte per <kbd>Leertaste</kbd> aufnehmen, per <kbd>Tab</kbd> eine Zielspalte wählen und wieder per <kbd>Leertaste</kbd> ablegen. Ist der Dokumentlink fokussiert, verschiebt <kbd>Alt</kbd> + <kbd>←</kbd> oder <kbd>→</kbd> ihn direkt in die benachbarte Spalte.</p><p>Die Karten bleiben nach Termin sortiert. Das Ziehen in eine andere Spalte ändert den Arbeitsstand; eine frei gespeicherte Reihenfolge einzelner Karten innerhalb derselben Spalte ist nicht vorgesehen.</p>`
			},
			{
				id: 'spalten',
				title: 'Das Board an deine Vorbereitung anpassen',
				html: `<h3>Eine Spalte ergänzen</h3><ol><li>Wähle das Pluszeichen <strong>Spalte hinzufügen</strong> am Ende des Boards.</li><li>Gib einen eindeutigen Namen ein, etwa „Rückfragen klären“.</li><li>Bestätige mit <strong>Hinzufügen</strong>.</li></ol><h3>Eine Spalte umbenennen oder verschieben</h3><p>Klicke auf den Spaltentitel oder wähle im Drei-Punkte-Menü <strong>Umbenennen</strong>. Bestätige den neuen Namen mit <kbd>Enter</kbd>; <kbd>Escape</kbd> bricht ab. Über <strong>Nach links verschieben</strong> und <strong>Nach rechts verschieben</strong> änderst du die Reihenfolge. Ohne aktiven Arbeitsstandsfilter kannst du auch die ganze Spalte ziehen.</p><h3>Eine Spalte löschen</h3><ol><li>Öffne ihr Drei-Punkte-Menü und wähle <strong>Spalte löschen</strong>.</li><li>Wähle eine andere Zielspalte für die zugeordneten Ausarbeitungen.</li><li>Bestätige den Löschvorgang im Dialog.</li></ol><p>Die Ausarbeitungen werden in die Zielspalte übernommen. Mindestens eine Spalte muss bestehen bleiben. Pro Konto sind bis zu 30 Spalten mit eindeutigen Namen von höchstens 80 Zeichen möglich. Spaltenänderungen gelten für dein persönliches Board.</p>`
			},
			{
				id: 'filtern',
				title: 'In vielen Vorbereitungen die passende finden',
				html: `<p>Oberhalb des Boards kannst du einen einzelnen Arbeitsstand oder <strong>Alle</strong> wählen. Zusätzlich durchsucht das Suchfeld Titel und Inhalt. Mit <strong>Alle Formate</strong>, <strong>Alle Reihen</strong> und <strong>Alle Jahre</strong> beziehungsweise einer konkreten Auswahl grenzt du die Karten ein. Bestätige die Formularauswahl mit <strong>Filtern</strong>.</p><p>Die Filter wirken zusammen. Wenn eine Karte fehlt, prüfe sowohl den gewählten Arbeitsstand als auch die übrigen Filter. Die Jahresauswahl gehört zur Terminplanung der Ausarbeitungen; die Notizbibliothek besitzt dagegen ausdrücklich einen Filter nach Erstellungsjahr.</p><p>Auf dem Smartphone kannst du das Board seitlich bewegen oder einen einzelnen Arbeitsstand auswählen. Für das Ändern einer Karte bietet die geöffnete Dokumentseite dieselbe Arbeitsstand-Auswahl ohne Ziehen.</p>`
			},
			{
				id: 'typ-wechseln',
				title: 'Aus einer Notiz eine Ausarbeitung machen',
				html: `<ol><li>Öffne die vollständige Dokumentseite deiner Notiz.</li><li>Wähle <strong>In Ausarbeitung umwandeln</strong>.</li><li>Ergänze Format, Arbeitsstand, Termin und Reihe nach Bedarf.</li><li>Öffne <strong>Ausarbeitungen</strong>, um den Beitrag auf dem Board wiederzufinden.</li></ol><p>Inhalt, Schlagwörter und Bibelstellen bleiben erhalten. Mit <strong>In Notiz umwandeln</strong> ist auch der Rückweg möglich; vorhandene Daten der Ausarbeitung bleiben dabei erhalten. Eine bereits freigegebene Notiz muss zuerst ihre Freigabe zurücknehmen, bevor sie umgewandelt werden kann.</p><details><summary>Verschieben meldet, dass Karte oder Spalte geändert wurden.</summary><p>Die Ansicht wurde zwischenzeitlich auf einem anderen Gerät oder in einem anderen Tab geändert. Das Board lädt den aktuellen Stand. Prüfe ihn und führe die gewünschte Änderung erneut aus.</p></details><details><summary>Ist „Gehalten“ dasselbe wie eine Durchführung?</summary><p>Die Spalte beschreibt den Arbeitsstand. „Bereits gehalten“ dokumentiert einzelne tatsächliche Termine mit Ort. Trage diese Angaben gesondert ein, wenn du einen nachvollziehbaren Verlauf möchtest.</p></details>`
			}
		]
	},
	{
		id: 'vorlagen-materialien',
		topic: 'predigten',
		path: '/help/predigten/vorlagen-materialien',
		title: 'Vorlagen, Material und durchgeführte Termine verwalten',
		description:
			'Nutze wiederverwendbare Gliederungen, füge Anlagen und Stellensammlungen hinzu und halte Datum und Ort jeder Durchführung fest.',
		icon: 'file-text',
		audience: 'user',
		level: 'guide',
		prerequisite:
			'Du bist angemeldet. Für Material und Durchführungen ist eine eigene Ausarbeitung geöffnet.',
		keywords: [
			'Vorlagen',
			'Markdown',
			'Anlagen',
			'Dateien',
			'Anhänge',
			'Durchführung',
			'Bereits gehalten',
			'Verlauf',
			'Ort',
			'Stellensammlung verknüpfen'
		],
		sections: [
			{
				id: 'schritte',
				title: 'Eine wiederkehrende Vorbereitung einrichten',
				html: `<ol><li>Öffne in <strong>Vorbereitung</strong> den Link <strong>Ausarbeitungsvorlagen</strong>.</li><li>Gib unter <strong>Neue Vorlage</strong> einen Namen und eine Markdown-Gliederung ein.</li><li>Wähle <strong>Vorlage erstellen</strong>.</li><li>Gehe zurück zur Vorbereitung und wähle diese Vorlage beim Anlegen einer neuen Ausarbeitung.</li><li>Ergänze auf der Dokumentseite unter <strong>Anlagen</strong> deine Materialdateien und verknüpfe bei Bedarf eine <strong>Stellensammlung</strong>.</li><li>Trage nach der Veranstaltung unter <strong>Bereits gehalten</strong> das tatsächliche Datum und den Ort ein.</li></ol><p>Eine Vorlage gibt dem Schreiben einen Anfang. Anlagen, Stellensammlungen und Durchführungen gehören anschließend zur jeweiligen Ausarbeitung.</p>`
			},
			{
				id: 'vorlagen',
				title: 'Eine eigene Gliederung als Vorlage speichern',
				html: `<p>Unter <strong>Ausarbeitungsvorlagen</strong> besteht jede Vorlage aus einem eindeutigen <strong>Namen der Vorlage</strong> und einem <strong>Vorlagentext (Markdown)</strong>. Für einen Hauskreis könnte die Gliederung so beginnen:</p><pre><code>## Einstieg

## Gemeinsam lesen

## Beobachtungen am Text

## Fragen zum Gespräch

## Anwendung im Alltag

## Offene Fragen</code></pre><p>Mit <strong>Vorlage erstellen</strong> wird sie in deinem Konto gespeichert. Öffne später unter <strong>Eigene Vorlagen</strong> den Namen, um Titel oder Text zu ändern, und bestätige mit <strong>Speichern</strong>. <strong>Löschen</strong> entfernt die Vorlage nach einer Rückfrage.</p><p>Beim Anlegen einer Ausarbeitung kannst du zwischen <strong>Akribos-Standardvorlage</strong>, <strong>Leeres Dokument</strong> und deinen eigenen Vorlagen wählen. Die Standardvorlage enthält unter anderem Bibeltext, Kerngedanke, Ziel, Gliederung, Anwendung sowie Illustrationen und Quellen.</p><p>Eine neue Ausarbeitung erhält eine Kopie des Vorlagentexts. Spätere Änderungen an der Vorlage verändern bestehende Ausarbeitungen nicht. Ebenso löscht das Entfernen einer Vorlage keine bereits daraus erstellten Dokumente.</p>`,
				screenshot: {
					src: '/help/live/preparation-template.webp',
					width: 934,
					height: 452,
					alt: 'Formular für eine neue Hauskreisvorlage mit Namen, Markdown-Gliederung und Schaltfläche Vorlage erstellen.',
					caption:
						'Die Aufnahme zeigt den Vorlagentext vor dem Erstellen. Nach dem Speichern steht die eigene Gliederung für neue Ausarbeitungen zur Auswahl.'
				}
			},
			{
				id: 'anlagen',
				title: 'Materialdateien an der Ausarbeitung ablegen',
				html: `<ol><li>Öffne die vollständige Seite deiner Ausarbeitung.</li><li>Wähle unter <strong>Anlagen</strong> die Schaltfläche <strong>Dateien hinzufügen</strong>.</li><li>Wähle eine oder mehrere Dateien auf deinem Gerät aus.</li><li>Warte auf <strong>Anlagen gespeichert.</strong> Die Liste zeigt Dateinamen und Größe.</li></ol><p>Ein Klick auf den Dateinamen lädt die Anlage herunter. Über das Papierkorbsymbol und <strong>Löschen bestätigen</strong> entfernst du eine Anlage; <strong>Abbrechen</strong> verwirft die Löschabsicht.</p><p>Eine Datei darf höchstens 50 MiB groß sein. Je Ausarbeitung sind bis zu 50 Anlagen mit insgesamt 200 MiB möglich. Leere Dateien werden abgewiesen. Die Dateien bleiben Materialien deiner privaten Ausarbeitung und werden nicht in den Fließtext eingebettet.</p><p>Falls mehrere Dateien nacheinander hochgeladen werden und eine davon scheitert, prüfe zunächst die Liste: Bereits erfolgreich hochgeladene Anlagen können dort vorhanden sein. Lade anschließend nur die fehlenden Dateien erneut hoch.</p><p>Beim <a href="/help/import-export/dokumente-exportieren">Export als Markdown, Word oder PDF</a> werden die Anlagen nicht als Dateipaket mitgegeben. Lade benötigtes Material gesondert herunter.</p>`,
				screenshot: {
					src: '/help/live/preparation-attachment.webp',
					width: 320,
					height: 238,
					alt: 'Anlagenbereich einer Ausarbeitung mit der hochgeladenen Textdatei akribos-gespraechsfragen.txt und Dateiverwaltung.',
					caption:
						'Die gespeicherte Anlage lässt sich über ihren Dateinamen herunterladen. Weitere Dateien ergänzt du mit Dateien hinzufügen.'
				}
			},
			{
				id: 'sammlungen',
				title: 'Passende Stellensammlungen beim Schreiben nutzen',
				html: `<ol><li>Suche auf der Ausarbeitungsseite den Bereich <strong>Stellensammlungen</strong>.</li><li>Wähle unter <strong>Vorhandene Stellensammlung</strong> eine verfügbare Sammlung.</li><li>Bestätige mit <strong>Stellensammlung verknüpfen</strong>.</li></ol><p>Die Sammlung erscheint mit ihrem Titel und ihren Bibelstellen an deiner Vorbereitung. Der Titel führt zur ganzen Sammlung, eine Stelle zum Bibeltext.</p><p>Wenn du erst beginnen möchtest, öffne <strong>Neue Stellensammlung anlegen</strong>, trage einen Namen ein und wähle <strong>Anlegen und verknüpfen</strong>. Fülle die Sammlung anschließend mit den Versen für deine Vorbereitung.</p><p>Über <strong>Verknüpfung lösen</strong> entfernst du die Zuordnung zur Ausarbeitung. Die Sammlung selbst bleibt bestehen. Das Verknüpfen erteilt anderen Personen keinen Zugriff auf deine private Ausarbeitung; Einladungen und Leselinks betreffen weiterhin nur die Sammlung. Siehe <a href="/help/listen/gemeinsam-arbeiten">Gemeinsam an Stellensammlungen arbeiten</a>.</p>`,
				screenshot: {
					src: '/help/live/preparation-collection.webp',
					width: 320,
					height: 324,
					alt: 'Eine mit der Ausarbeitung verknüpfte Stellensammlung mit vier Bibelstellen aus Johannes.',
					caption:
						'Die Sammlung bleibt von der Ausarbeitung unabhängig. Ihre Verse sind direkt an der Vorbereitung erreichbar.'
				}
			},
			{
				id: 'durchfuehrungen',
				title: 'Jede Durchführung mit Datum und Ort festhalten',
				html: `<ol><li>Öffne auf der Ausarbeitungsseite <strong>Bereits gehalten</strong>.</li><li>Trage unter <strong>Datum</strong> den tatsächlichen Termin ein.</li><li>Ergänze den <strong>Ort</strong>, etwa „Hauskreis Nord“ oder „Gemeindezentrum“.</li><li>Wähle <strong>Durchführung hinzufügen</strong>.</li></ol><p>Wiederhole den Vorgang, wenn du dieselbe Ausarbeitung später noch einmal verwendest. Jeder Termin wird als eigener Eintrag geführt. Datum und Ort sind erforderlich. Einen falschen Eintrag entfernst du mit <strong>Durchführung entfernen</strong> und legst ihn anschließend mit den richtigen Angaben neu an.</p><p>Diese Liste ist der Verlauf deiner durchgeführten Termine. Sie archiviert keine älteren Fassungen des Textes. Wenn du den genauen Wortlaut eines bestimmten Termins aufbewahren möchtest, <a href="/help/import-export/dokumente-exportieren">exportiere die entsprechende Fassung</a> vor einer größeren Überarbeitung.</p><p>Die Durchführungseinträge werden beim Dokumentexport berücksichtigt. Eine geplante Veranstaltung und eine tatsächlich durchgeführte Veranstaltung bleiben getrennte Angaben.</p>`
			},
			{
				id: 'fragen-mobil',
				title: 'Häufige Fragen zu Vorlagen und Material',
				html: `<details><summary>Ich finde keine Anlagen oder Durchführungen.</summary><p>Diese Bereiche gehören zu Ausarbeitungen. Öffne deren vollständige Dokumentseite; im kompakten Notizbereich neben dem Reader sind nicht alle Verwaltungsfelder sichtbar. Prüfe außerdem den Dokumenttyp.</p></details><details><summary>Eine Vorlage mit meinem Namen existiert schon.</summary><p>Öffne den vorhandenen Eintrag unter „Eigene Vorlagen“, wenn du ihn ändern möchtest. Für eine zusätzliche Vorlage brauchst du einen unterscheidbaren Namen.</p></details><details><summary>Der Upload verlangt, zuerst einen Speicherfehler zu beheben.</summary><p>Kontrolliere die Meldung im Texteditor. Anlagen werden erst hinzugefügt, wenn die laufenden Textänderungen gespeichert werden konnten. Lass den Text offen und folge der <a href="/help/dokumente/editor-bedienen#speichern">Hilfe zum Speicherstatus</a>.</p></details><p>Auf schmalen Bildschirmen stehen die Zusatzbereiche unter dem Schreibbereich statt daneben. Scrolle zum gewünschten Abschnitt. Die Dateiauswahl verwendet den Dialog deines Smartphones; du kannst dort auch gespeicherte Dokumente aus dessen Dateiverwaltung auswählen.</p>`
			}
		]
	},
	{
		id: 'stellensammlung-anlegen',
		topic: 'listen',
		path: '/help/listen/stellensammlung-anlegen',
		title: 'Bibelstellen sammeln und kommentieren',
		description:
			'Lege eine private Stellensammlung zu deinem Thema an, ergänze Verse aus dem Reader und halte deine Beobachtungen in Kommentaren fest.',
		icon: 'list',
		audience: 'user',
		level: 'guide',
		prerequisite:
			'Du bist angemeldet. Für eine neue Sammlung brauchst du keine weiteren Mitglieder.',
		keywords: [
			'Stellensammlung',
			'Liste',
			'Verse',
			'Versbereich',
			'Kommentar',
			'Antworten',
			'Reaktionen',
			'Umbenennen',
			'Löschen'
		],
		sections: [
			{
				id: 'schritte',
				title: 'Eine Sammlung zu deinem Thema anlegen',
				html: `<ol><li>Öffne <strong>Notizen &amp; Ausarbeitungen → Stellensammlungen</strong>.</li><li>Gib oben einen Titel ein, zum Beispiel „Licht und Leben – Johannes entdecken“.</li><li>Wähle <strong>Neue Stellensammlung</strong>.</li><li>Gib auf der Sammlungsseite unter <strong>Zur Stellensammlung hinzufügen</strong> eine Stelle wie <code>Joh 1,4-5</code> ein und bestätige mit der gleichnamigen Schaltfläche.</li><li>Ergänze weitere Stellen, etwa <code>Joh 8,12</code> und <code>Joh 12,46</code>.</li><li>Wähle an einem Vers <strong>Kommentar hinzufügen</strong>, schreibe deine Beobachtung und bestätige mit <strong>Speichern</strong>.</li></ol><p>Die Sammlung ist zunächst privat. Du kannst sie für dein persönliches Studium führen und später gezielt <a href="/help/listen/gemeinsam-arbeiten">Mitglieder einladen oder einen Leselink teilen</a>.</p>`,
				screenshot: collectionScreenshot
			},
			{
				id: 'verse',
				title: 'Verse direkt oder beim Lesen hinzufügen',
				html: `<p>Auf der Sammlungsseite muss die Eingabe eine Versangabe enthalten. <code>Joh 3,16</code> fügt einen Vers hinzu, <code>Joh 3,16-18</code> die drei Verse des Bereichs. Ein bloßes Kapitel wie „Joh 3“ genügt hier nicht. Für eine Passage über mehrere Kapitel ergänze die passenden Versbereiche kapitelweise.</p><p>Beim Lesen kannst du das Versmenü über die Versnummer öffnen und dort <strong>Zur Stellensammlung hinzufügen</strong> verwenden. Wähle eine bestehende Sammlung oder <strong>Neue Liste mit diesem Vers</strong>. Bereits enthaltene Verse sind im Menü erkennbar. Für Vers 1 öffnet die große Kapitelzahl das Versmenü.</p><p>Ein Vers erscheint in derselben Sammlung nur einmal. Neue Verse werden hinten ergänzt; ein Versbereich wird in seiner Versreihenfolge eingefügt. Der Titel einer Sammlung ist kein Filter für den Inhalt: Du entscheidest selbst, welche Stellen dazugehören.</p><p>Über die Stellenangabe am Eintrag liest du den Vers <strong>Im Kapitel</strong> und kannst seinen Zusammenhang prüfen. Die Sammlung hält die Referenz fest; der angezeigte Wortlaut richtet sich nach der für diese Ansicht verfügbaren Bibel.</p>`
			},
			{
				id: 'kommentare',
				title: 'Beobachtungen, Antworten und Reaktionen ergänzen',
				html: `<ol><li>Wähle unter einem Vers <strong>Kommentar hinzufügen</strong>.</li><li>Schreibe deinen Gedanken im Kommentarfeld.</li><li>Nutze bei Bedarf Fett, Kursiv, Unterstrichen, Durchgestrichen, Überschrift, Listen oder Zitat in der Werkzeugleiste.</li><li>Bestätige mit <strong>Speichern</strong>. Mit <strong>Abbrechen</strong> schließt du die Eingabe.</li></ol><p>Für eine Antwort auf einen vorhandenen Kommentar wähle direkt darunter <strong>Antworten</strong>. So bleibt sichtbar, worauf du dich beziehst. Mit einem Emoji reagierst du auf den jeweiligen Kommentar; ein erneuter Klick auf dieselbe Reaktion nimmt deinen Beitrag zu dieser Reaktion zurück.</p><p>Kommentare benötigen ausdrücklich <strong>Speichern</strong>. <kbd>Strg</kbd>/<kbd>Cmd</kbd> + <kbd>Enter</kbd> speichert ebenfalls. <kbd>Escape</kbd> schließt das offene Eingabefeld, solange keine Übertragung läuft.</p><p>Über <strong>Kommentar löschen</strong> kannst du eigene Beiträge entfernen. Der Eigentümer der Sammlung kann auch andere Beiträge entfernen. Wird ein übergeordneter Kommentar gelöscht, werden seine Antworten ebenfalls entfernt. Es gibt dafür keinen Notiz-Papierkorb.</p><p>Eine private Notiz in deiner Bibliothek und ein Kommentar in einer Stellensammlung sind verschiedene Inhalte. In einer gemeinsam genutzten Sammlung sehen die anderen Mitglieder deine Kommentare; ein aktivierter Leselink macht sie auch dessen Besuchern sichtbar.</p>`,
				screenshot: {
					src: '/help/live/collection-discussion.webp',
					width: 736,
					height: 415,
					alt: 'Kommentar von Anna zu Johannes 1,4 mit einer Reaktion und einer eingerückten Antwort von Jonas.',
					caption:
						'Antworten bleiben ihrem Kommentar zugeordnet. Reaktionen zeigen Zustimmung, ohne einen zusätzlichen Kommentar zu benötigen.'
				}
			},
			{
				id: 'verwalten',
				title: 'Titel ändern, Verse entfernen und die Sammlung löschen',
				html: `<h3>Umbenennen</h3><p>Als Eigentümer kannst du den Titel oben bearbeiten und mit <strong>Speichern</strong> übernehmen. Die Karte in <strong>Alle Stellensammlungen</strong> verwendet danach den neuen Namen.</p><h3>Einen Vers entfernen</h3><p>Wähle am Eintrag das Kreuz <strong>Aus Stellensammlung entfernen</strong>. Als Mitglied kannst du nur selbst hinzugefügte Verse entfernen; als Eigentümer jeden Vers. Mit einem Vers werden auch seine zugehörigen Kommentare aus dieser Sammlung entfernt.</p><h3>Die gesamte Sammlung löschen</h3><ol><li>Öffne als Eigentümer am Ende der Seite <strong>Stellensammlung löschen</strong>.</li><li>Lies die Rückfrage, die ausdrücklich alle Kommentare einschließt.</li><li>Bestätige mit <strong>Löschen</strong>.</li></ol><p>Dieser Vorgang entfernt die Sammlung samt Kommentaren. Wenn du lediglich den öffentlichen Zugriff beenden möchtest, nimm stattdessen den Leselink zurück. Als eingeladenes Mitglied steht dir <strong>Liste verlassen</strong> zur Verfügung.</p>`
			},
			{
				id: 'mobil-fragen',
				title: 'Unterwegs sammeln und typische Fragen klären',
				html: `<p>Auf dem Smartphone kannst du Verse genauso über das Versmenü sammeln. Auf der Sammlungsseite stehen Verse, Kommentare, Mitglieder und Teilen untereinander. Scrolle zu den unteren Bereichen, wenn du die Zugriffsverwaltung suchst.</p><details><summary>Warum sehe ich ein Kreuz nur bei manchen Versen?</summary><p>Du bist Mitglied einer fremden Sammlung. Entfernen darfst du die von dir hinzugefügten Verse. Alle Verse darf nur der Eigentümer entfernen.</p></details><details><summary>Warum kann ich auf dem geteilten Link nicht kommentieren?</summary><p>Der Leselink dient ausschließlich zum Lesen. Für Kommentare brauchst du eine angenommene Einladung und öffnest die Sammlung anschließend in deinem Konto unter „Stellensammlungen“.</p></details><details><summary>Wird dieselbe Stelle mehrfach angelegt?</summary><p>Eine bereits enthaltene Stelle wird beim erneuten Hinzufügen nicht als zweiter identischer Verse-Eintrag angelegt.</p></details><details><summary>Kann ich die Sammlung zu meiner Ausarbeitung hinzufügen?</summary><p>Öffne die Ausarbeitung und nutze dort „Stellensammlung verknüpfen“. Die <a href="/help/predigten/vorlagen-materialien#sammlungen">Anleitung zu Materialien</a> erklärt den Ablauf.</p></details>`
			}
		]
	},
	{
		id: 'gemeinsam-arbeiten',
		topic: 'listen',
		path: '/help/listen/gemeinsam-arbeiten',
		title: 'Stellensammlungen gemeinsam bearbeiten oder zum Lesen teilen',
		description:
			'Lade Mitglieder per E-Mail ein, verstehe die Rollen und verwalte Antworten, Leselinks, zurückgezogene Einladungen und Austritte.',
		icon: 'user',
		audience: 'user',
		level: 'guide',
		prerequisite:
			'Du besitzt eine Stellensammlung. Eingeladene Mitglieder benötigen ein eigenes Konto.',
		keywords: [
			'Mitglieder',
			'Einladung',
			'E-Mail',
			'Zusammenarbeit',
			'Rollen',
			'Teilen',
			'Link',
			'Nicht gelistet',
			'Widerrufen',
			'Entfernen',
			'Verlassen'
		],
		sections: [
			{
				id: 'schritte',
				title: 'Eine Person zur Mitarbeit einladen',
				html: `<ol><li>Öffne deine Stellensammlung.</li><li>Scrolle zum Bereich <strong>Mitglieder</strong>.</li><li>Trage unter <strong>E-Mail-Adresse einladen</strong> die Adresse der gewünschten Person ein.</li><li>Wähle <strong>Einladen</strong>. Die Einladung erscheint als <strong>Ausstehend</strong>.</li><li>Die eingeladene Person öffnet den Link aus ihrer E-Mail, meldet sich mit dieser Adresse an und wählt <strong>Einladung annehmen</strong>.</li><li>Nach dem Beitritt findet sie die Sammlung unter <strong>Stellensammlungen</strong> und kann Verse und Kommentare ergänzen.</li></ol><p>Eine Einladung ermöglicht Mitarbeit mit einem bestimmten Konto. Zusätzlich kannst du einen Leselink für Menschen bereitstellen, die nur die Ergebnisse lesen sollen.</p>`,
				screenshot: {
					src: '/help/live/collection-invite.webp',
					width: 686,
					height: 34,
					alt: 'Einladungsformular einer Stellensammlung mit Feld für die E-Mail-Adresse und Schaltfläche Einladen.',
					caption:
						'Der Eigentümer lädt Mitglieder im Bereich „Mitglieder“ per E-Mail ein. Die eingeladene Person bestätigt den Beitritt selbst.'
				}
			},
			{
				id: 'rollen',
				title: 'Wer darf was?',
				html: `<table><thead><tr><th>Aktion</th><th>Eigentümer</th><th>Mitglied</th><th>Besucher des Leselinks</th></tr></thead><tbody><tr><td>Verse und Kommentare lesen</td><td>Ja</td><td>Ja</td><td>Ja, solange der Leselink aktiv ist</td></tr><tr><td>Verse hinzufügen</td><td>Ja</td><td>Ja</td><td>Nein</td></tr><tr><td>Verse entfernen</td><td>Alle</td><td>Nur selbst hinzugefügte</td><td>Nein</td></tr><tr><td>Kommentieren, antworten und reagieren</td><td>Ja</td><td>Ja</td><td>Nein</td></tr><tr><td>Kommentare löschen</td><td>Alle</td><td>Eigene Kommentare</td><td>Nein</td></tr><tr><td>Titel, Mitglieder und Leselink verwalten</td><td>Ja</td><td>Nein</td><td>Nein</td></tr><tr><td>Sammlung löschen</td><td>Ja</td><td>Nein</td><td>Nein</td></tr></tbody></table><p>Die eigene Rolle ergibt sich daraus, ob du die Sammlung angelegt oder eine Einladung angenommen hast. Es gibt hier keine frei konfigurierbaren Bearbeitungsrollen. Eine Einladung zu einer Sammlung gibt keinen Zugriff auf private Notizen oder Ausarbeitungen.</p><p>Für das Gespräch wählst du an einem Vers <strong>Kommentar hinzufügen</strong> oder unter einem Beitrag <strong>Antworten</strong>. Speichere deinen Text ausdrücklich mit <strong>Speichern</strong>. Ein Klick auf eine Emoji-Reaktion fügt deine Reaktion hinzu; der zweite nimmt sie zurück. Die <a href="/help/listen/stellensammlung-anlegen#kommentare">Anleitung zu Kommentaren</a> zeigt die Bedienelemente im Detail.</p>`
			},
			{
				id: 'einladung-annehmen',
				title: 'Eine Einladung annehmen',
				html: `<ol><li>Öffne den Einladungslink aus deiner E-Mail.</li><li>Wenn du noch nicht angemeldet bist, wähle <strong>Anmelden</strong> beziehungsweise <strong>Konto erstellen</strong>.</li><li>Verwende genau die E-Mail-Adresse, an die die Einladung geschickt wurde.</li><li>Öffne nach der Anmeldung den Einladungslink erneut, falls du noch nicht zur Einladung zurückgeführt wurdest.</li><li>Prüfe Titel und einladende Person und wähle <strong>Einladung annehmen</strong>.</li></ol><p>Das bloße Öffnen der E-Mail oder ihres Links nimmt die Einladung noch nicht an. Die Annahme ist ein eigener Schritt. Einladungen sind sieben Tage gültig. Ist die Einladung abgelaufen oder zurückgezogen, benötigst du eine neue.</p><details><summary>„Falsches Konto angemeldet“ wird angezeigt.</summary><p>Wähle „Mit anderem Konto anmelden“ und verwende die eingeladene Adresse. Ein anderes eigenes Konto kann die Einladung nicht stellvertretend annehmen.</p></details><details><summary>Die Einladung fehlt im Postfach.</summary><p>Prüfe die angegebene Adresse und den Spam-Ordner. Bitte den Eigentümer gegebenenfalls, dich erneut einzuladen. Nach vielen Einladungen in kurzer Zeit kann eine vorübergehende Versandbegrenzung greifen.</p></details>`,
				screenshot: {
					src: '/help/live/collection-accept.webp',
					width: 384,
					height: 275,
					alt: 'Bestätigungsansicht einer Einladung zur Stellensammlung mit der Schaltfläche Einladung annehmen.',
					caption:
						'Erst „Einladung annehmen“ schließt den Beitritt ab. Verwende das Konto mit der eingeladenen E-Mail-Adresse.'
				}
			},
			{
				id: 'mitglieder-verwalten',
				title: 'Einladungen und Mitgliedschaft beenden',
				html: `<h3>Eine ausstehende Einladung zurücknehmen</h3><p>Öffne als Eigentümer <strong>Mitglieder</strong> und wähle bei der ausstehenden Einladung <strong>Einladung zurückziehen</strong>. Der bisherige Einladungslink kann danach nicht mehr zum Beitritt verwendet werden.</p><h3>Ein Mitglied entfernen</h3><p>Wähle als Eigentümer bei der beigetretenen Person <strong>Entfernen</strong>. Damit endet deren Mitarbeit. Die Liste der beigetretenen Mitglieder ist auch für andere Mitglieder sichtbar; ausstehende Einladungen mit E-Mail-Adresse sieht nur der Eigentümer.</p><h3>Eine fremde Sammlung verlassen</h3><ol><li>Öffne als Mitglied die Sammlung.</li><li>Öffne <strong>Liste verlassen</strong>.</li><li>Bestätige die Rückfrage erneut mit <strong>Liste verlassen</strong>.</li></ol><p>Du verlierst den Zugriff als Mitglied. Bereits beigesteuerte Verse und Kommentare werden durch das Verlassen nicht automatisch entfernt. Der Eigentümer kann seine eigene Sammlung auf diesem Weg nicht verlassen.</p><p>Mitgliedschaft und Leselink werden unabhängig verwaltet. Solange ein Leselink aktiv ist, kann eine entfernte Person mit diesem Link weiterhin die geteilte Leseansicht öffnen. Wenn auch dieser Zugriff enden soll, nimm zusätzlich den Leselink zurück.</p>`
			},
			{
				id: 'leselink',
				title: 'Einen Leselink ohne Anmeldung bereitstellen',
				html: `<ol><li>Öffne als Eigentümer unten auf der Sammlungsseite den Bereich <strong>Teilen</strong>.</li><li>Wähle <strong>Teilen</strong>.</li><li>Die Adresse der Leseansicht erscheint. Wähle <strong>Kopieren</strong> und gib den Link an die gewünschten Leser weiter.</li></ol><p>Jeder mit dem Link kann die Sammlung ohne Anmeldung lesen und den Link weitergeben. Die Leseansicht enthält die Verse sowie Kommentare, Antworten und deren angezeigte Autorennamen. Sie erlaubt kein Hinzufügen, Antworten oder Reagieren.</p><p>Der Link zeigt den aktuellen Inhalt der Sammlung. Neue Kommentare oder ergänzte Verse werden ebenfalls lesbar. Es handelt sich nicht um einen unveränderlichen Schnappschuss. Der geteilte Text verwendet eine öffentlich verfügbare Bibel und gibt keine privaten Werke deines Kontos frei.</p><p>Zum Mitarbeiten müssen eingeladene Personen die Sammlung über den angemeldeten Bereich <strong>Stellensammlungen</strong> öffnen. Auch ein angemeldetes Mitglied erhält auf der öffentlichen Leseansicht keine zusätzlichen Bearbeitungsschaltflächen.</p>`
			},
			{
				id: 'leselink-zuruecknehmen',
				title: 'Die Linkfreigabe zurücknehmen',
				html: `<ol><li>Öffne die Sammlung als Eigentümer.</li><li>Gehe zum Bereich <strong>Teilen</strong>.</li><li>Betätige dort die Schaltfläche <strong>Diese Liste ist privat.</strong>, um die aktive Freigabe auszuschalten.</li></ol><p>Die Linkanzeige verschwindet. Wenn du später erneut <strong>Teilen</strong> wählst, erzeugt Akribos einen neuen Link. Gib dann den neuen Link weiter; die alte Adresse wird nicht wieder aktiviert. Eingeladene Mitglieder behalten ihren eigenen Zugriff, bis du sie entfernst oder sie die Sammlung verlassen.</p><p>Eine bereits geöffnete oder kurzzeitig zwischengespeicherte Leseansicht kann noch den zuvor geladenen Inhalt anzeigen. Bereits angefertigte Kopien lassen sich nicht zurückholen. Entscheide deshalb vor dem Teilen, welche Kommentare für den vorgesehenen Leserkreis geeignet sind.</p><p>Auf dem Smartphone liegen Mitgliederverwaltung und Teilen unter den Versen. Scrolle bis zum gewünschten Bereich; die Rollen und Abläufe sind dieselben wie am Computer.</p>`
			}
		]
	},
	{
		id: 'dokumente-importieren',
		topic: 'import-export',
		path: '/help/import-export/dokumente-importieren',
		title: 'Word, Markdown und Obsidian-Notizen importieren',
		description:
			'Übernimm vorhandene Texte mit einer überprüfbaren Vorschau. Erfahre, welche Dateien, Metadaten und Formatierungen erhalten bleiben.',
		icon: 'download',
		audience: 'user',
		level: 'guide',
		prerequisite: 'Du bist angemeldet und hast die Quelldateien auf deinem Gerät verfügbar.',
		keywords: [
			'Import',
			'Word',
			'docx',
			'Markdown',
			'md',
			'Obsidian',
			'ZIP',
			'Frontmatter',
			'Vorschau',
			'Warnungen',
			'Konvertierung'
		],
		sections: [
			{
				id: 'schritte',
				title: 'Ein vorhandenes Dokument übernehmen',
				html: `<ol><li>Öffne <strong>Notizen</strong> und wähle <strong>Importieren</strong>.</li><li>Wähle unter <strong>Word-/Markdown-Dateien oder ZIP-Archiv</strong> deine Datei oder Dateien aus.</li><li>Wähle <strong>Importvorschau erstellen</strong>.</li><li>Prüfe für jedes Dokument Titel, Typ, Schlagwörter, Bibelstellen, Text und <strong>Hinweise zur Konvertierung</strong>.</li><li>Wenn die Vorschau stimmt, wähle am Ende <strong>Als privates Dokument importieren</strong>.</li><li>Öffne die entstandene Notiz oder Ausarbeitung und kontrolliere wichtige Überschriften, Verweise und Zitate.</li></ol><p>Die Vorschau legt noch kein Dokument an. Erst die abschließende Bestätigung erzeugt private Arbeitskopien in deinem Konto. Deine Quelldateien auf dem Gerät bleiben erhalten.</p>`
			},
			{
				id: 'dateien',
				title: 'Welche Dateien du auswählen kannst',
				html: `<dl class="definition-list"><div><dt>Word (.docx)</dt><dd>Wähle eine oder mehrere moderne Word-Dateien. Alte .doc-Dateien musst du vorher in Word oder einem kompatiblen Programm als .docx speichern.</dd></div><div><dt>Markdown (.md)</dt><dd>Wähle eine oder mehrere Textdateien in UTF-8. Optionales YAML-Frontmatter kann Titel, Typ, Schlagwörter und Bibelstellen beschreiben.</dd></div><div><dt>ZIP-Archiv</dt><dd>Wähle genau ein Archiv mit Markdown-Dateien, etwa aus einem Obsidian-Bestand. Ein ZIP wird nicht mit einzeln ausgewählten Dateien gemischt.</dd></div></dl><p>Pro Import sind höchstens 100 Dateien möglich. Ein Markdown-Dokument ist auf 1 MiB Text zuzüglich 64 KiB Frontmatter begrenzt. Für Archive und entpackte Inhalte sowie Word-Dateien gelten weitere Größenprüfungen; die Importseite nennt den Grund, wenn eine Auswahl nicht übernommen werden kann.</p><p>Ein ZIP ist hier eine Sammelauswahl für Markdown, kein vollständiger Import einer Obsidian-Arbeitsumgebung. Plugins, Einstellungen, eingebettete Medien und Anlagen werden nicht als Akribos-Funktionen übernommen.</p>`
			},
			{
				id: 'vorschau',
				title: 'Die Vorschau sorgfältig lesen',
				html: `<p>Jeder Vorschauabschnitt nennt den Quelldateinamen und den erkannten Dokumenttyp. Darunter stehen Titel, Schlagwörter, Bibelstellen und der umgewandelte Text. Die Kennzeichnung <strong>Privat</strong> beschreibt die entstehende Arbeitskopie.</p><p><strong>Hinweise zur Konvertierung</strong> zeigen Änderungen, die du prüfen solltest: etwa entfernte Einbettungen, unbekannte Metadaten oder nicht erkannte Stellen. Eine Warnung kann eine lesbare Anpassung erklären. Fehler wie eine ungültige Datei verhindern dagegen die Bestätigung der Auswahl.</p><ol><li>Vergleiche wichtige Passagen mit deiner Quelldatei.</li><li>Prüfe besonders Bibelstellen und übersetzungsbezogene Zuordnungen.</li><li>Falls eine Korrektur nötig ist, passe die Quelldatei an und erstelle eine neue Vorschau.</li><li>Bestätige erst die endgültige Auswahl am Seitenende.</li></ol><p>Wiederholtes Importieren erzeugt weitere Dokumente; es ist kein automatischer Abgleich mit bereits vorhandenen Notizen. Wenn du eine Datei versehentlich doppelt übernommen hast, entferne die zusätzliche Notiz anschließend in der Bibliothek.</p>`,
				screenshot: {
					src: '/help/live/import-preview.webp',
					width: 1425,
					height: 1496,
					alt: 'Importvorschau der Markdown-Datei Das Wort wurde Mensch mit Titel, Schlagwörtern, Bibelstelle und Text vor der Bestätigung.',
					caption:
						'Prüfe die umgewandelten Inhalte, bevor du am Ende eine neue private Arbeitskopie anlegst. Die Vorschau speichert noch kein Dokument.'
				}
			},
			{
				id: 'konvertierung',
				title: 'Was erhalten bleibt und was sich verändert',
				html: `<h3>Word</h3><p>Text, Überschriften, Listen und Links werden übernommen. Echte Word-Fußnoten und Endnoten werden zu bearbeitbaren Akribos-Fußnoten einschließlich ihrer Formatierung. Seitenlayout, Bilder, Anlagen und Kommentare aus Word werden ausgelassen. Der Import überträgt den lesbaren Text in den Akribos-Editor; ein druckfertiges Word-Seitenlayout wird dabei nicht nachgebaut.</p><h3>Markdown und Obsidian</h3><ul><li>Überschriften der Ebenen 1 bis 6 bleiben als Überschriften erhalten.</li><li>Fußnoten mit <code>[^name]</code> und der zugehörigen Definition bleiben als bearbeitbare Anmerkungen erhalten. Prüfe Hinweise bei fehlenden oder mehrfach vergebenen Definitionen.</li><li>Tabellenlayout, besondere Startwerte nummerierter Listen und Linktitel bleiben nicht erhalten.</li><li>Aufgaben-Kontrollkästchen werden zu gewöhnlichem lesbarem Text.</li><li>Bilder, Anlagen und Einbettungen werden entfernt oder auf eine lesbare Beschriftung reduziert.</li><li>Obsidian-Wikilinks werden, soweit unterstützt, zu normalen internen Links. Prüfe ihre Ziele nach dem Import.</li><li>Rohes HTML außer unterstütztem Unterstreichen und Hervorheben sowie zusätzliche Attribute werden entfernt.</li><li>Zeilenenden und nachgestellte Leerzeichen werden vereinheitlicht.</li></ul><p>Ein Dateiverweis auf eine andere Anwendung erhält durch den Import nicht automatisch einen passenden Zielbeitrag in Akribos. Verknüpfe zusammengehörige Dokumente nach der Übernahme bei Bedarf über <a href="/help/dokumente/bibeltexte-verknuepfungen#erwaehnungen">@-Erwähnungen</a>.</p>`
			},
			{
				id: 'metadaten',
				title: 'Titel, Schlagwörter und Bibelstellen mitnehmen',
				html: `<p>Eine Markdown-Datei kann vor dem eigentlichen Text einen Metadatenblock zwischen zwei Zeilen mit <code>---</code> enthalten. Ein kleines Beispiel:</p><pre><code>---
title: Licht und Leben
type: note
tags:
  - Johannes/Licht
  - Persönliches Studium
passages:
  - reference: Joh 1,4-5
---

## Beobachtung

Hier beginnt meine Notiz.</code></pre><p><code>type: note</code> legt eine Notiz an; <code>type: sermon</code> eine Ausarbeitung. Für Ausarbeitungen können zusätzlich Angaben zu Arbeitsstand, Format, Reihe, geplantem Termin und bereits durchgeführten Terminen übernommen werden. Der zuverlässigste Ausgangspunkt für umfangreichere Metadaten ist eine <a href="/help/import-export/dokumente-exportieren#markdown">aus Akribos exportierte Markdown-Datei</a>.</p><p>Ein Import kann weder Eigentümer noch öffentliche Freigabe setzen. Auch exportierte Erstellungs- und Änderungszeitstempel werden nicht als ursprüngliche Kontodaten wiederhergestellt. Unbekannte oder unzulässige Felder werden mit einem Hinweis ignoriert.</p><p>Pro Dokument sind bis zu 100 ausdrücklich verknüpfte Bibelstellen möglich. Wenn ein Übersetzungsbezug auf ein Werk verweist, das für dein Konto nicht verfügbar ist, korrigiere die Angabe vor der Bestätigung.</p>`
			},
			{
				id: 'fehler-mobil',
				title: 'Importprobleme beheben',
				html: `<details><summary>Die Bestätigung ist nicht möglich.</summary><p>Prüfe die Fehlermeldungen zur gesamten Auswahl und zu einzelnen Dateien. Korrigiere oder entferne problematische Dateien und erstelle die Vorschau erneut. Ein ZIP darf nicht gemeinsam mit einzelnen Dateien ausgewählt sein.</p></details><details><summary>Die Markdown-Datei ist kein gültiges UTF-8.</summary><p>Öffne sie in einem Texteditor, speichere sie mit UTF-8-Zeichenkodierung und wähle die neue Datei aus. Eine umbenannte PDF- oder Word-Datei wird durch die Endung .md nicht zu Markdown.</p></details><details><summary>Meine Word-Datei wird abgewiesen.</summary><p>Prüfe, ob sie wirklich im .docx-Format vorliegt und sich in Word öffnen lässt. Speichere sie gegebenenfalls neu. Große eingebettete Medien können die zulässige Größe überschreiten, obwohl der sichtbare Text kurz ist.</p></details><details><summary>Der Text ist vorhanden, aber Bilder fehlen.</summary><p>Das entspricht dem Umfang des Dokumentimports. Bewahre die Originaldatei auf und lege benötigte Materialien bei einer Ausarbeitung gesondert als Anlagen ab.</p></details><p>Auf dem Smartphone öffnet die Dateiauswahl den Dialog des Geräts. Bei längeren Dokumenten lohnt es sich, die Vorschau vollständig durchzugehen; die endgültige Importschaltfläche folgt erst nach dem letzten Vorschautext.</p>`
			}
		]
	},
	{
		id: 'dokumente-exportieren',
		topic: 'import-export',
		path: '/help/import-export/dokumente-exportieren',
		title: 'Notizen und Ausarbeitungen als Markdown, Word oder PDF exportieren',
		description:
			'Lade deine Texte für die Weiterbearbeitung, zum Ausdrucken oder als eigene Dateikopie herunter und wähle das passende Exportformat.',
		icon: 'download',
		audience: 'user',
		level: 'guide',
		prerequisite: 'Du bist angemeldet und hast eine eigene Notiz oder Ausarbeitung geöffnet.',
		keywords: [
			'Export',
			'Herunterladen',
			'Markdown',
			'Word',
			'docx',
			'PDF',
			'Drucken',
			'Sicherung',
			'Metadaten'
		],
		sections: [
			{
				id: 'schritte',
				title: 'Eine Datei herunterladen',
				html: `<ol><li>Öffne die vollständige Seite deiner Notiz oder Ausarbeitung.</li><li>Prüfe, dass der Texteditor <strong>Gespeichert</strong> anzeigt.</li><li>Öffne oben das Menü <strong>Exportieren</strong>.</li><li>Wähle <strong>Markdown</strong>, <strong>Word (.docx)</strong> oder <strong>PDF</strong>.</li><li>Öffne die heruntergeladene Datei und kontrolliere den gewünschten Textstand.</li></ol><p>Die gleichen Formate findest du auch im Bereich <strong>Export</strong> auf der Dokumentseite. Der Download enthält die Fassung dieses Dokuments, keine vollständige Sicherung deines Kontos.</p>`,
				screenshot: {
					src: '/help/live/export-menu.webp',
					width: 160,
					height: 110,
					alt: 'Geöffnetes Exportmenü mit Markdown, Word (.docx) und PDF.',
					caption:
						'Wähle das Format passend zur Weiterverwendung. Jedes Format lädt eine eigene Datei dieses Dokuments herunter.'
				}
			},
			{
				id: 'format-waehlen',
				title: 'Das passende Format wählen',
				html: `<table><thead><tr><th>Format</th><th>Geeignet für</th><th>Was du erhältst</th></tr></thead><tbody><tr><td>Markdown</td><td>Text weiterverarbeiten, in Obsidian nutzen oder später wieder importieren</td><td>Lesbarer Text mit Auszeichnung und einem Metadatenblock</td></tr><tr><td>Word (.docx)</td><td>In einer Textverarbeitung weiterarbeiten und das Seitenlayout gestalten</td><td>Ein formatiertes, bearbeitbares Dokument</td></tr><tr><td>PDF</td><td>Lesen, weitergeben und ausdrucken</td><td>Eine direkt lesbare Ausgabe mit festem Seitenlayout</td></tr></tbody></table><p>Wenn du für einen gehaltenen Termin einen bestimmten Textstand aufbewahren möchtest, exportiere ihn mit einem passenden Dateinamen. Spätere Änderungen am Akribos-Dokument verändern bereits heruntergeladene Dateien nicht.</p>`
			},
			{
				id: 'markdown',
				title: 'Markdown mit Metadaten weiterverwenden',
				html: `<p>Der Markdown-Export enthält den Dokumenttext einschließlich Fußnotenverweisen und vollständigen Definitionen sowie YAML-Frontmatter. Dazu gehören Titel, Dokumenttyp, Schlagwörter und ausdrücklich verknüpfte Bibelstellen. Bei Ausarbeitungen kommen Angaben zu Arbeitsstand, Format, Termin, Reihe und Durchführungen hinzu.</p><p>Du kannst die Datei mit einem normalen Texteditor oder einer Markdown-Anwendung öffnen. Der Metadatenblock beginnt und endet mit <code>---</code>; darunter steht dein eigentlicher Text.</p><p>Beim erneuten <a href="/help/import-export/dokumente-importieren">Import in Akribos</a> entsteht eine neue private Arbeitskopie. Die ursprünglichen Zeitstempel dienen nur zur Information. Ein Import aktualisiert nicht automatisch das ursprüngliche Dokument und stellt keine öffentliche Freigabe wieder her.</p><p>Links auf private Akribos-Dokumente bleiben Verweise auf diese Ziele. Die exportierte Datei enthält nicht zusätzlich den vollständigen Text jedes verlinkten Beitrags. Ein solcher Link erteilt dem Empfänger keinen Zugriff auf deine privaten Notizen.</p>`
			},
			{
				id: 'word-pdf',
				title: 'Word und PDF lesen, gestalten oder ausdrucken',
				html: `<p>Die Word- und PDF-Ausgaben enthalten Titel und Text in einem lesbaren Dokumentaufbau. Vorhandene Bibelstellen, Schlagwörter sowie relevante Planungs- und Durchführungsangaben werden als Metadaten ausgegeben.</p><p>Word enthält echte, weiter bearbeitbare Fußnoten. Im PDF stehen die Anmerkungen gesammelt am Dokumentende; die Verweisnummern führen dorthin. Auch Anmerkungen ohne verbliebenen Textverweis werden ausgegeben.</p><p>Öffne eine Word-Datei in deiner Textverarbeitung, wenn du etwa Seitenumbrüche, Schriftgröße oder ein Handout-Layout weiter anpassen möchtest. Eine PDF kannst du im PDF-Programm oder Browser öffnen und dort ausdrucken. Der Export ist eine eigene Ausgabe; er bildet nicht die vollständige Akribos-Oberfläche oder einen Reader-Arbeitsbereich ab.</p><p>Prüfe vor dem Verteilen den Inhalt der Datei, insbesondere persönliche Notizen, Planungsangaben und Quellen. Das Herunterladen veröffentlicht selbst nichts in Akribos. Eine weitergegebene Datei bleibt anschließend eine eigenständige Kopie.</p>`
			},
			{
				id: 'umfang',
				title: 'Was du zusätzlich sichern solltest',
				html: `<p>Der Dokumentexport umfasst keine angehängten Dateien und kein vollständiges Paket verknüpfter Stellensammlungen. Lade benötigte Anlagen über ihren Dateinamen herunter. Kommentare aus einer Sammlung sind ebenfalls kein Bestandteil des Textdokuments, nur weil die Sammlung daran verknüpft ist.</p><p>Benannte Reader-Arbeitsbereiche, persönliche Markierungen, Vorlagen und andere Kontoeinstellungen werden mit diesem Download nicht gesammelt gesichert. Für ein einzelnes Dokument erhältst du die ausgewählte Textausgabe.</p><details><summary>Der Export startet nicht.</summary><p>Prüfe zuerst den Speicherstatus des Editors. Wenn aktuelle Änderungen nicht gespeichert werden können, behebe die angezeigte Meldung. Prüfe anschließend die Downloadanzeige und den Downloadordner deines Browsers.</p></details><details><summary>Auf dem Smartphone öffnet sich nur eine Vorschau.</summary><p>Das Verhalten hängt vom Browser und Dateiformat ab. Verwende in der geöffneten Datei die Download- beziehungsweise Teilen-Funktion des Geräts, um sie in deiner Dateiverwaltung abzulegen.</p></details><details><summary>Kann ich eine alte Fassung wiederherstellen?</summary><p>Eine zuvor exportierte Markdown-Datei kannst du als neues privates Dokument importieren. Vergleiche sie mit deinem aktuellen Text, bevor du Änderungen übernimmst. Der Editor bietet keinen eigenen dauerhaften Versionsverlauf älterer Textfassungen.</p></details>`
			}
		]
	},
	{
		id: 'notizen-im-reader',
		topic: 'dokumente',
		path: '/help/dokumente/notizen-im-reader',
		title: 'Beim Bibellesen Notizen und Ausarbeitungen öffnen',
		description:
			'Schreibe neben dem Bibeltext, finde Beiträge zur aktuellen Stelle und wechsle auf dem Smartphone zwischen Lesen und Notiz.',
		icon: 'layout',
		audience: 'user',
		level: 'guide',
		prerequisite: 'Du bist angemeldet und hast den Reader geöffnet.',
		keywords: [
			'Notizbereich',
			'Reader',
			'Neben dem Bibeltext',
			'Meine Dokumente',
			'Kapitelfilter',
			'Tags',
			'Lesen',
			'Notiz',
			'Mobil'
		],
		sections: [
			{
				id: 'schritte',
				title: 'Eine Beobachtung direkt am Text festhalten',
				html: `<ol><li>Öffne die gewünschte Bibelstelle im Reader, beispielsweise <a href="/Joh1,14">Johannes 1,14</a>.</li><li>Öffne das Versmenü über die Versnummer und wähle die Notizfunktion. Alternativ blendest du über das Layout-Menü den <strong>Notizbereich</strong> ein.</li><li>Prüfe im Notizbereich die angezeigte <strong>Aktuelle Stelle</strong>.</li><li>Wähle unter <strong>Übersetzungsbezug</strong> die betreffende Bibel oder <strong>Kanonisch (alle Übersetzungen)</strong>.</li><li>Wähle <strong>Notiz für … anlegen</strong>.</li><li>Schreibe deine Beobachtung und warte auf <strong>Gespeichert</strong>.</li></ol><p>Die Notiz erscheint auch in deiner persönlichen Bibliothek. Du brauchst keine zweite Kopie anzulegen, um später außerhalb des Readers weiterzuschreiben.</p>`,
				screenshot: notesScreenshot
			},
			{
				id: 'aktuelle-stelle',
				title: 'Den Bezug zur Stelle bewusst wählen',
				html: `<p>Unter <strong>Aktuelle Stelle</strong> zeigt Akribos den Bibelkontext, zu dem du den Notizbereich geöffnet hast. Bereits verknüpfte Notizen erscheinen direkt darunter und lassen sich per Titel öffnen.</p><p>Für eine allgemeine Beobachtung wählst du <strong>Kanonisch (alle Übersetzungen)</strong>. Wenn dein Gedanke die Wortwahl einer bestimmten Übersetzung betrifft, belässt du diese Bibel als Übersetzungsbezug. Kontrolliere die angezeigte Stelle, bevor du eine neue Notiz anlegst.</p><p>Ist bereits ein Text geöffnet, führt das Listensymbol <strong>Notizen für … anzeigen</strong> zur Auswahl zurück. Der Wechsel wartet zunächst auf ausstehende Textänderungen. Er legt keine zusätzliche Notiz an.</p>`
			},
			{
				id: 'bibliothek-filter',
				title: 'Vorhandene Dokumente im Notizbereich finden',
				html: `<ol><li>Öffne im Notizbereich die Übersicht statt eines einzelnen Textes.</li><li>Suche unter <strong>Meine Dokumente</strong> mit <strong>Titel und Inhalt durchsuchen</strong>.</li><li>Wähle bei Bedarf unter <strong>Tag filtern</strong> ein Schlagwort.</li><li>Aktiviere <strong>Nur Notizen zum aktuellen Kapitel</strong>, wenn du die Auswahl auf den aktuellen Kapitelkontext einschränken möchtest.</li><li>Öffne einen Treffer über seinen Titel.</li></ol><p>Die Bibliothek in diesem Bereich kann Notizen und Ausarbeitungen anzeigen. Der Dokumenttyp steht am Treffer. Suche, Tag und Kapitelfilter werden miteinander kombiniert. Im Gegensatz zur großen Notizbibliothek aktualisiert sich die Suche hier während der Eingabe; du brauchst keinen zusätzlichen Suchknopf.</p><p>Mit <strong>Alle Tags</strong>, einem geleerten Suchfeld und ausgeschaltetem Kapitelfilter öffnest du die Auswahl wieder. Wenn „Weitere Treffer über die Suche oder Filter eingrenzen“ erscheint, präzisiere deine Suche. Der Kapitelfilter ist nur bedienbar, wenn ein Bibelkontext vorhanden ist.</p>`
			},
			{
				id: 'vollstaendiger-editor',
				title: 'Den Schreibbereich vergrößern oder alle Details öffnen',
				html: `<p>Am Computer stehen Reader und Notizbereich nebeneinander. Ziehe den Trenner, um dem Schreiben mehr oder weniger Breite zu geben. Für längere Texte kannst du im Editor den <strong>Zen-Modus</strong> verwenden.</p><p><strong>Im vollständigen Notiz-Editor öffnen</strong> führt zur Dokumentseite. Dort findest du zusätzlich Schlagwörter, Bibelstellen und Export; bei Ausarbeitungen auch Arbeitsstand, Materialien und Durchführungen. Von dort bringt <strong>Im Arbeitsbereich öffnen</strong> den Text wieder neben die Bibel.</p><p>Mit <strong>Notizbereich schließen</strong> blendest du den Bereich aus. Ausstehende Textänderungen werden vorher gespeichert. Kann eine Änderung nicht gespeichert werden, bleibt der Editor sichtbar und zeigt den Grund. Die <a href="/help/dokumente/editor-bedienen#speichern">Hilfe zum Speicherstatus</a> erklärt die nächsten Schritte.</p>`
			},
			{
				id: 'mobil',
				title: 'Auf dem Smartphone zwischen Lesen und Notiz wechseln',
				html: `<ol><li>Öffne den Notizbereich wie am Computer.</li><li>Wähle oben <strong>Notiz</strong>, um den Text oder die Dokumentauswahl zu sehen.</li><li>Wähle <strong>Lesen</strong>, um zur Bibel zurückzukehren.</li><li>Wechsle erneut zu <strong>Notiz</strong>, um weiterzuschreiben.</li></ol><p>Die Umschaltung nutzt die verfügbare Bildschirmfläche für einen Bereich zur Zeit. Die offenen Ressourcen-Tabs und das Dokument gehören weiterhin zu demselben Arbeitsbereich. Beim Wechsel zu „Lesen“ wartet Akribos auf die Speicherung deiner Eingaben.</p><details><summary>Die Umschaltung zurück zum Lesen reagiert nicht.</summary><p>Prüfe, ob der Editor einen Speicherfehler oder einen Konflikt meldet. Der Text bleibt dann sichtbar, damit du ungespeicherte Änderungen sichern kannst.</p></details><details><summary>Ich finde meine Notiz in der Auswahl nicht.</summary><p>Leere die Suche, wähle „Alle Tags“ und deaktiviere den Kapitelfilter. Prüfe dann die vollständige Bibliothek und gegebenenfalls deren Papierkorb.</p></details><details><summary>Warum sehe ich keine Schlagwortbearbeitung neben dem Bibeltext?</summary><p>Der kompakte Bereich konzentriert sich auf Auswahl und Schreiben. Öffne den vollständigen Editor, um die Metadaten des Dokuments zu bearbeiten.</p></details>`
			}
		]
	}
];
