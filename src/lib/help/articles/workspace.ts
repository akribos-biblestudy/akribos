import type { HelpArticle } from '../types';

export const workspaceArticle: HelpArticle = {
	id: 'arbeitsbereich-einrichten',
	topic: 'reader',
	path: '/help/reader/arbeitsbereich-einrichten',
	title: 'Einen Arbeitsbereich für dein Bibelstudium einrichten',
	description:
		'Öffne Bibel und Begleitwerke, verbinde ihre Lesestellen und speichere die Ansicht als eigenen Arbeitsbereich. Ein durchgängiges Beispiel mit Johannes 1.',
	icon: 'layout',
	audience: 'user',
	keywords: [
		'Arbeitsbereich',
		'Workspace',
		'Layout',
		'Kacheln',
		'Tabs',
		'Tabgruppen',
		'Synchronisieren',
		'Speichern',
		'Umbenennen',
		'Löschen',
		'Mobil',
		'Johannes'
	],
	level: 'guide',
	prerequisite:
		'Lesen und Anordnen funktionieren ohne Konto. Für benannte Arbeitsbereiche musst du angemeldet sein.',
	sections: [
		{
			id: 'ziel',
			title: 'Das richtest du ein',
			html: `<p>Eine Bibel, ein Kommentar und ein Lexikon bilden deinen Arbeitsplatz für Johannes 1. Die Werke bleiben gemeinsam geöffnet und du kannst jederzeit zwischen ihnen wechseln. Du speicherst die Ansicht unter „Johannes studieren“ und findest sie später im Menü <strong>Arbeitsbereiche</strong> wieder.</p>
			<p>Ein Arbeitsbereich merkt sich die Zusammenstellung deiner Werke, deren Lesestellen, das Layout, Tabgruppen und offene Suchen. Deine Notizen liegen in deiner persönlichen Bibliothek; ein Arbeitsbereich hilft dir, die passende Leseansicht dazu wiederzufinden.</p>`,
			screenshot: {
				src: '/help/live/workspace-overview.webp',
				width: 1440,
				height: 1000,
				alt: 'Akribos bei Johannes 1 mit nebeneinander geöffneten Werken und dem Arbeitsbereich-Menü im Kopfbereich.',
				caption:
					'Die fertige Studienansicht: Jedes Werk hat seinen eigenen Tab. Die gemeinsame Tabgruppe hält die Lesestellen zusammen.'
			}
		},
		{
			id: 'voraussetzungen',
			title: 'Bevor du beginnst',
			html: `<ul><li>Öffne <a href="/Joh1">Johannes 1 im Reader</a>. Ein Klick auf das Akribos-Logo führt ebenfalls zurück zum Bibeltext.</li><li><a href="/login">Melde dich an</a>, wenn du die Ansicht unter einem eigenen Namen speichern möchtest.</li><li>Für das Beispiel eignen sich eine deutsche Bibel, ein Kommentar zum Neuen Testament und ein griechisches Lexikon. Die Auswahl richtet sich nach den Werken, die für dein Konto verfügbar sind.</li></ul>
			<p>Am Computer kannst du mehrere Werke nebeneinander anzeigen. Auf dem Smartphone führt dieselbe Anleitung zu einer gemeinsamen Tab-Leiste; dort liest du jeweils ein Werk.</p>`
		},
		{
			id: 'stelle',
			title: '1. Die gewünschte Bibelstelle öffnen',
			html: `<ol><li>Wähle den Tab deiner Bibel.</li><li>Klicke in das Stellen- und Suchfeld dieses Tabs.</li><li>Gib <code>Joh 1</code> ein und bestätige mit <kbd>Enter</kbd>.</li></ol>
			<p>Der Bibeltext beginnt jetzt bei Johannes 1. Mit <code>Joh 1,14</code> springst du direkt zu Vers 14. Das Feld gehört immer zu dem Werk, in dessen Kachel du es bedienst.</p>
			<aside class="callout"><strong>Stelle oder Suchbegriff?</strong><p>Eine Stellenangabe enthält eine Kapitelzahl. Ein Wort wie <code>Anfang</code> startet eine Suche im aktuellen Werk. Mehr Beispiele findest du unter <a href="/help/bibelstellen">Bibelstellen finden</a>.</p></aside>`
		},
		{
			id: 'werke',
			title: '2. Bibel und Begleitwerke auswählen',
			html: `<ol><li>Öffne die Werkauswahl über das <strong>Pluszeichen</strong> in der Tab-Leiste einer Kachel.</li><li>Wähle eine weitere Bibel, einen Kommentar oder ein Lexikon aus. Das Werk wird als zusätzlicher Tab geöffnet.</li><li>Wiederhole den Schritt für die übrigen Werke deiner Studienansicht.</li></ol>
			<p>Für das Beispiel arbeiten wir mit Johannes 1. Ein Kommentar erklärt den Textzusammenhang; ein griechisches Lexikon hilft später bei der Wortstudie. Du kannst auch eine andere Übersetzung daneben öffnen.</p>
			<p>Ein Klick auf den Namen eines Tabs zeigt dieses Werk. Auch dasselbe Werk darf mehrfach geöffnet sein – etwa, um zwei voneinander unabhängige Stellen zu vergleichen. Das Informationssymbol am Werk zeigt seine Quellen- und Nutzungshinweise.</p>`,
			screenshot: {
				src: '/help/live/resource-picker.webp',
				width: 368,
				height: 416,
				alt: 'Die Werkauswahl im Reader mit verfügbaren Bibeln, Kommentaren und Lexika.',
				caption:
					'Wähle die Werke passend zu deiner Aufgabe. Das Pluszeichen ergänzt einen Tab in der aktuellen Kachel.'
			}
		},
		{
			id: 'layout',
			title: '3. Das Layout an deine Arbeit anpassen',
			html: `<ol><li>Öffne das <strong>Layout-Menü</strong> oben im Reader.</li><li>Wähle zum Beispiel drei Spalten, um Bibel, Kommentar und Lexikon nebeneinander zu lesen.</li><li>Wähle in jeder Kachel den Tab, den du dort sehen möchtest. Über das Pluszeichen ergänzt du ein fehlendes Werk direkt in der gewünschten Kachel.</li><li>Ziehe bei Bedarf den Trenner zwischen zwei Kacheln, bis die Textbreite angenehm ist.</li></ol>
			<p>Du kannst zwischen acht Anordnungen mit bis zu vier sichtbaren Kacheln wechseln. Eine Kachel kann mehrere Tabs enthalten, zeigt aber jeweils nur den aktiven Tab. Mehr Werke benötigen deshalb nicht automatisch mehr Spalten.</p>
			<aside class="callout"><strong>Beim Layoutwechsel bleiben deine Tabs erhalten.</strong><p>Wechselst du zu weniger Kacheln, übernimmt die letzte verbleibende Kachel die übrigen Tabs. Beim Erweitern werden vorhandene inaktive Tabs verteilt. Du kannst verschiedene Anordnungen ausprobieren, ohne deine offenen Werke zu schließen.</p></aside>
			<p>Auch mit der Tastatur lässt sich die Breite ändern: Fokussiere den Trenner mit <kbd>Tab</kbd> und verwende die Pfeiltasten. Die Größen merkt sich Akribos für die jeweilige Anordnung.</p>`
		},
		{
			id: 'gruppen',
			title: '4. Zusammengehörige Tabs verbinden',
			html: `<p>Eine <strong>Tabgruppe</strong> verbindet die Lesestellen mehrerer Werke. Sie ist am Buchstaben in der Tab-Werkzeugleiste erkennbar. Es gibt die Gruppen <strong>A bis E</strong> und die unabhängige Einstellung <strong>–</strong>.</p>
			<ol><li>Wähle in deinem Bibel-Tab die Gruppe <strong>A</strong>.</li><li>Weise dem Kommentar ebenfalls <strong>A</strong> zu. Ordne auch das Lexikon dieser Gruppe zu, wenn es für Wortstudien aus dieser Bibel verwendet werden soll.</li><li>Scrolle nun im Bibeltext. Der sichtbare Kommentar derselben Gruppe folgt der Lesestelle.</li></ol>
			<p>Ein gerade verdeckter Tab derselben Gruppe merkt sich die neue Stelle für sein nächstes Öffnen. Das Lexikon zeigt einen Wörterbucheintrag statt eines fortlaufenden Kapitels: Ein Klick auf ein mit Strong verknüpftes Wort öffnet die passende Wortstudie in einem Lexikon derselben Gruppe.</p>
			<p>Für einen unabhängigen Vergleich setzt du einen Tab auf <strong>–</strong> oder auf einen anderen Buchstaben. So kannst du beispielsweise Johannes 1 lesen, während eine zweite Bibel bei 1. Mose 1 stehen bleibt.</p>`
		},
		{
			id: 'anlegen',
			title: '5. Einen benannten Arbeitsbereich anlegen',
			html: `<p>Richte zuerst deine gewünschte Ansicht ein. Ein neuer Arbeitsbereich übernimmt den Stand, den du gerade im Reader siehst.</p>
			<ol><li>Öffne oben das Menü <strong>Arbeitsbereiche</strong>.</li><li>Wähle <strong>Neuer Arbeitsbereich …</strong>.</li><li>Trage als Namen <strong>Johannes studieren</strong> ein.</li><li>Bestätige mit <strong>Anlegen</strong>.</li></ol>
			<p>Akribos öffnet den neu angelegten Arbeitsbereich. Er ist jetzt der aktive Eintrag im Menü. Bei der ersten Nutzung wird deine bisherige Ansicht außerdem unter <strong>Standard</strong> bewahrt.</p>
			<p>Verwende Namen, an denen du die Aufgabe wiedererkennst – zum Beispiel „Johannes studieren“, „Tägliche Lektüre“ oder „Vorbereitung Hauskreis“. Jeder Name muss in deinem Konto eindeutig sein.</p>`,
			screenshot: {
				src: '/help/live/workspace-create.webp',
				width: 464,
				height: 286,
				alt: 'Dialog zum Anlegen des Arbeitsbereichs Johannes studieren mit Namensfeld und Schaltfläche Anlegen.',
				caption:
					'Der neue Arbeitsbereich beginnt mit deiner aktuellen Ansicht. Nach dem Anlegen arbeitest du direkt darin weiter.'
			}
		},
		{
			id: 'speichern',
			title: 'Was automatisch gespeichert wird',
			html: `<p>Für deine laufende Arbeit brauchst du keine zusätzliche Speichern-Schaltfläche. Änderungen am aktiven Arbeitsbereich werden automatisch übernommen.</p>
			<dl class="definition-list"><div><dt>Werke und Anordnung</dt><dd>Offene Tabs, aktive Tabs, Kachellayout und Trennergrößen.</dd></div><div><dt>Lesestellen</dt><dd>Die Stelle jedes Tabs und seine Zuordnung zu einer Tabgruppe.</dd></div><div><dt>Studienansicht</dt><dd>Offene Suchen, Lexikon-Einträge und zugehöriger Wortstudien-Kontext.</dd></div><div><dt>Notizfilter</dt><dd>Die aktuelle Such- und Filterauswahl im Notizbereich.</dd></div></dl>
			<p>Mit deinem Konto kannst du den benannten Arbeitsbereich auch auf einem anderen Gerät öffnen. Die persönliche Vor-/Zurück-Historie eines Tabs gehört dagegen zur laufenden Reader-Sitzung.</p>
			<aside class="callout"><strong>Ein kopierter Link ist eine eigene Ansicht.</strong><p>Die Reader-Adresse enthält die sichtbare Zusammenstellung. Ein fremder oder älterer Link kann deshalb eine andere Ansicht öffnen, ohne deinen gespeicherten Arbeitsbereich zu ersetzen. Öffne deinen Eintrag im Menü „Arbeitsbereiche“, um bewusst zu deinem gespeicherten Stand zurückzukehren. Ein Link erteilt außerdem keinen Zugriff auf private Werke.</p></aside>`
		},
		{
			id: 'wechseln',
			title: 'Arbeitsbereiche wechseln und verwalten',
			html: `<h3>Zu einem anderen Arbeitsbereich wechseln</h3><ol><li>Öffne <strong>Arbeitsbereiche</strong>.</li><li>Wähle den gewünschten Namen, etwa <strong>Standard</strong>.</li><li>Die zugehörigen Werke, Stellen und Suchen werden geöffnet. Der aktive Eintrag ist im Menü hervorgehoben und mit einem Häkchen markiert.</li></ol>
			<h3>Einen Arbeitsbereich umbenennen</h3><ol><li>Öffne im Arbeitsbereich-Menü das <strong>Stiftsymbol</strong> neben dem gewünschten Eintrag.</li><li>Ändere den Namen.</li><li>Bestätige mit <strong>Speichern</strong>.</li></ol>
			<h3>Einen Arbeitsbereich löschen</h3><ol><li>Öffne zuerst einen anderen Arbeitsbereich. Der aktuell aktive Eintrag kann nicht gelöscht werden.</li><li>Wähle das Stiftsymbol neben dem nicht mehr benötigten Eintrag.</li><li>Wähle <strong>Löschen …</strong> und bestätige den angezeigten Namen mit <strong>Löschen</strong>.</li></ol><p>Du entfernst damit die gespeicherte Ansicht. Deine Notizen, Ausarbeitungen und Stellensammlungen bleiben in deinem Konto erhalten.</p>`,
			screenshot: {
				src: '/help/live/workspace-menu.webp',
				width: 304,
				height: 156,
				alt: 'Arbeitsbereich-Menü mit den gespeicherten Ansichten Standard und Johannes studieren sowie den Stiftsymbolen zum Bearbeiten.',
				caption:
					'Ein Klick auf den Namen öffnet den Arbeitsbereich; das Stiftsymbol führt zum Umbenennen oder Löschen.'
			}
		},
		{
			id: 'mobil',
			title: 'Auf dem Smartphone weiterarbeiten',
			html: `<p>Auf einem schmalen Bildschirm zeigt Akribos die Ressourcen in einer gemeinsamen Tab-Leiste. Die Tabs stammen aus allen Kacheln deines Arbeitsbereichs. Du wählst direkt das Werk aus, das du lesen möchtest.</p>
			<ol><li>Öffne denselben Arbeitsbereich über das Buchsymbol <strong>Arbeitsbereiche</strong> im Kopfbereich.</li><li>Tippe in der mobilen Tab-Leiste auf die gewünschte Bibel, den Kommentar oder das Lexikon.</li><li>Benutze das Stellen- und Suchfeld wie auf dem Computer. Die Tabgruppen und gespeicherten Stellen gelten auch hier.</li></ol>
			<p>Deine Desktop-Anordnung bleibt gespeichert. Wenn du später wieder an einem breiteren Bildschirm arbeitest, kannst du die Werke erneut nebeneinander lesen.</p>`,
			screenshot: {
				src: '/help/live/reader-mobile.webp',
				width: 390,
				height: 844,
				portrait: true,
				alt: 'Mobile Reader-Ansicht bei Johannes 1 mit einer gemeinsamen Ressourcen-Tab-Leiste oberhalb des Bibeltexts.',
				caption:
					'Auf dem Smartphone wechselst du direkt zwischen den Werken. Die Anordnung für größere Bildschirme bleibt erhalten.'
			}
		},
		{
			id: 'fragen',
			title: 'Häufige Fragen zum Arbeitsbereich',
			html: `<details><summary>Warum folgt ein Werk beim Scrollen nicht?</summary><p>Vergleiche die Buchstaben der beteiligten Tabs. Sichtbare Kapitelwerke müssen derselben Gruppe A–E angehören. „–“ bedeutet unabhängig. Ein Lexikon folgt keinem Kapitelstrom, sondern zeigt den ausgewählten Eintrag.</p></details>
			<details><summary>Ich finde „Neuer Arbeitsbereich …“ nicht.</summary><p>Melde dich an und öffne den Reader. Auf anderen Seiten kannst du vorhandene Arbeitsbereiche öffnen; neue Ansichten legst du im Reader an.</p></details>
			<details><summary>Warum ist „Löschen …“ nicht verfügbar?</summary><p>Der betreffende Arbeitsbereich ist noch aktiv. Öffne zuerst einen anderen Eintrag und bearbeite danach den zu löschenden Arbeitsbereich.</p></details>
			<details><summary>Was passiert ohne Anmeldung?</summary><p>Du kannst Werke öffnen, anordnen und miteinander verbinden. Der Browser merkt sich deine Leseansicht. Benannte Arbeitsbereiche und deren geräteübergreifende Nutzung benötigen ein Konto.</p></details>
			<details><summary>Warum fehlt ein Werk nach dem Öffnen?</summary><p>Ein Arbeitsbereich kann nur Werke öffnen, die aktuell für dich verfügbar sind. Wurde ein Werk entfernt oder seine Freigabe widerrufen, erscheint dieser Tab nicht mehr.</p></details>
			<details><summary>Kann ich zwei Arbeitsbereiche mit demselben Namen anlegen?</summary><p>Jeder Name muss in deinem Konto eindeutig sein. Wähle einen unterscheidbaren Namen, zum Beispiel „Johannes – Wortstudie“ und „Johannes – Hauskreis“.</p></details>`
		}
	]
};
