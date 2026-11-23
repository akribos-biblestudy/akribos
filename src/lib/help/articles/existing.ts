// Topic entry points retain the URLs and anchors of the original help.
import type { HelpArticle } from '../types';

export const existingArticles: HelpArticle[] = [
	{
		id: 'erste-schritte',
		episode: 1,
		topic: 'erste-schritte',
		path: '/help/erste-schritte',
		title: 'Erste Schritte',
		description: 'In wenigen Minuten zur ersten Bibelstelle.',
		icon: 'book-open',
		audience: 'user',
		keywords: ['Einstieg', 'Schnellstart', 'Tutorial', 'Tour'],
		level: 'overview',
		sections: [
			{
				id: 'anleitung',
				title: 'Deine erste Bibelstelle öffnen',
				html: '<ol><li><a href="/Joh1">Öffne die Bibel</a>. Zum Lesen brauchst du kein Konto.</li><li>Gib im Feld eines Bibel-Tabs <code>Joh 3,16</code> ein und bestätige mit <kbd>Enter</kbd>.</li><li>Öffne über das Pluszeichen einen Kommentar oder eine zweite Bibel. Im Menü <strong>Kachelanordnung</strong> kannst du beide nebeneinander anzeigen.</li><li>Halte eine Beobachtung fest: Nach der <a href="/help/konto#anmelden-und-profil-verwalten">Anmeldung</a> kannst du Verse markieren und eigene Notizen schreiben.</li></ol>'
			},
			{
				id: 'dein-naechster-schritt',
				title: 'Womit möchtest du weitermachen?',
				html: '<p>Beginne mit <a href="/help/bibelstellen#finden-und-weiterlesen">Stellenwahl und Weiterlesen</a>, wenn du dich im Reader orientieren möchtest. Die Anleitung <a href="/help/reader#arbeitsbereich-einrichten">Einen Arbeitsbereich einrichten</a> begleitet dich beim Zusammenstellen deiner Werke. Für eine konkrete Frage findest du hier <a href="/help/suchen#woerter-und-strong-finden">die Suche</a>, <a href="/help/strong#wortstudie-durchfuehren">Wortstudien</a> und <a href="/help/dokumente#notizen-organisieren">persönliche Notizen</a>.</p>'
			},
			{
				id: 'produkt-tour',
				title: 'Die Produkt-Tour starten und wiederholen',
				html: '<ol><li>Öffne <a href="/Joh1">den Reader</a>.</li><li>Öffne oben rechts das <strong>Konto-Menü</strong>: Ohne Anmeldung erkennst du es am Personensymbol, angemeldet an deinem Anfangsbuchstaben.</li><li>Wähle <strong>Produkt-Tour</strong>.</li><li>Lies den Hinweis zum hervorgehobenen Bedienelement und wähle <strong>Weiter</strong>. Mit <strong>Zurück</strong> kehrst du zum vorherigen Hinweis zurück.</li><li>Beende die letzte Station mit <strong>Fertig</strong>. Zum vorzeitigen Beenden wähle <strong>Tour überspringen</strong> oder drücke <kbd>Escape</kbd>.</li></ol><p>Bei deinem ersten Reader-Besuch kann die Tour automatisch beginnen. Akribos merkt sich das Beenden oder Überspringen für diesen Browser, bei angemeldeten Nutzern auch im Konto. Nach deiner ersten Anmeldung können ergänzende Hinweise zu persönlichen Funktionen erscheinen. Über das Konto-Menü kannst du die Tour jederzeit wiederholen.</p><p>Angemeldet gibt es außerdem passende Touren in der Notizbibliothek, auf einer Dokumentseite, beim Dokumentimport, im Vorbereitungsboard und bei den Ausarbeitungsvorlagen. Öffne zuerst den gewünschten Bereich und starte dort „Produkt-Tour“. Auf Seiten ohne eigene Tour, etwa dieser Hilfeseite, fehlt der Menüeintrag.</p><p>Die Tour erklärt nur gerade sichtbare Bedienelemente. Ein nicht vorhandenes oder ausgeblendetes Ziel wird übersprungen; deshalb kann die Folge je nach geöffnetem Werk, Bildschirm und Kontorolle unterschiedlich ausfallen.</p>',
				screenshot: {
					src: '/help/live/product-tour.webp',
					width: 320,
					height: 207,
					alt: 'Erste Station der Produkt-Tour: Reader-Layout und Notizspalte, mit Schrittanzeige und den Schaltflächen Tour überspringen und Weiter.',
					caption:
						'Die erste Station erklärt Kachelanordnung und Notizspalte. Weiter führt zum nächsten Hinweis; Tour überspringen beendet die Einführung.'
				}
			},
			{
				id: 'konto-noetig',
				title: 'Brauche ich schon ein Konto?',
				html: '<p>Bibeltext, Werkauswahl, Suche und verfügbare Lexika lassen sich ohne Anmeldung verwenden. Ein Konto brauchst du für persönliche Notizen, Markierungen, Stellensammlungen und benannte Arbeitsbereiche. Du kannst zunächst lesen und dich später anmelden.</p>'
			}
		]
	},
	{
		id: 'bibelstellen',
		topic: 'bibelstellen',
		path: '/help/bibelstellen',
		title: 'Bibelstellen finden',
		description: 'Buch, Kapitel und Vers direkt aufrufen.',
		icon: 'map-pin',
		audience: 'user',
		keywords: ['Navigation', 'Stellenangabe', 'Kapitel', 'Vers', 'Verlauf', 'zurück', 'vor'],
		level: 'overview',
		anchors: {
			schnellstart: 'finden-und-weiterlesen--schnellstart',
			'buchnamen-suchen': 'finden-und-weiterlesen--schreibweisen',
			'zwischen-kapiteln-wechseln': 'finden-und-weiterlesen--weiterlesen'
		},
		sections: []
	},
	{
		id: 'reader',
		topic: 'reader',
		path: '/help/reader',
		title: 'Lesen & vergleichen',
		description: 'Werke, Tabs, Layout und Tabgruppen verstehen.',
		icon: 'layout',
		audience: 'user',
		keywords: [
			'Bibel',
			'Übersetzung',
			'Kommentar',
			'Parallelstellen',
			'Arbeitsbereich',
			'synchronisieren'
		],
		level: 'overview',
		anchors: {
			schnellstart: 'arbeitsbereich-einrichten',
			orientierung: 'werke-tabs-und-layouts--begriffe'
		},
		sections: [
			{
				id: 'textgroesse-und-farbschema',
				title: 'Textgröße und Farbschema',
				html: '<p>A− und A+ vergrößern oder verkleinern den Lesetext. Das Sonnen-/Mondsymbol wechselt das Design. Weitere Angaben zur persönlichen Darstellung und Standardübersetzung findest du unter <a href="/help/konto#leseansicht-anpassen">Leseansicht anpassen</a>.</p>'
			}
		]
	},
	{
		id: 'strong',
		topic: 'strong',
		path: '/help/strong',
		title: 'Strong & Urtext',
		description: 'Wortbedeutung, Grammatik und Vorkommen untersuchen.',
		icon: 'book',
		audience: 'user',
		keywords: ['Lexikon', 'Wörterbuch', 'Griechisch', 'Hebräisch', 'Grundtext', 'Lemma'],
		level: 'overview',
		anchors: {
			schnellstart: 'wortstudie-durchfuehren--schnellstart',
			'was-die-angaben-bedeuten': 'wortstudie-durchfuehren--eintrag',
			'keine-angaben': 'wortstudie-durchfuehren--fragen'
		},
		sections: []
	},
	{
		id: 'suchen',
		topic: 'suchen',
		path: '/help/suchen',
		title: 'Im Bibeltext suchen',
		description: 'Wörter und Wortfolgen finden und Treffer filtern.',
		icon: 'search',
		audience: 'user',
		keywords: ['Volltextsuche', 'Wortsuche', 'Phrase', 'Buchfilter'],
		level: 'overview',
		anchors: {
			schnellstart: 'woerter-und-strong-finden--schnellstart',
			syntax: 'woerter-und-strong-finden--suchausdruecke',
			'keine-treffer': 'woerter-und-strong-finden--fragen'
		},
		sections: []
	},
	{
		id: 'verse',
		topic: 'verse',
		path: '/help/verse',
		title: 'Mit Versen arbeiten',
		description: 'Verse kopieren, markieren und mit Notizen verbinden.',
		icon: 'highlight',
		audience: 'user',
		keywords: ['Versmenü', 'Markierungen', 'Farbe', 'Notizspalte'],
		level: 'overview',
		anchors: {
			schnellstart: 'kopieren-markieren-und-wiederfinden--schnellstart',
			'eigene-markierungsfarben-verwalten': 'kopieren-markieren-und-wiederfinden--farben',
			'private-notizen-neben-dem-bibeltext':
				'kopieren-markieren-und-wiederfinden--notizen-und-sammlungen'
		},
		sections: []
	},
	{
		id: 'listen',
		topic: 'listen',
		path: '/help/listen',
		title: 'Stellensammlungen',
		description: 'Bibelstellen sammeln, kommentieren und teilen.',
		icon: 'list',
		audience: 'user',
		keywords: ['Liste', 'Freigabe', 'Zusammenarbeit', 'Sammlung'],
		level: 'overview',
		anchors: {
			schnellstart: 'stellensammlung-anlegen--schritte',
			zusammenarbeit: 'gemeinsam-arbeiten'
		},
		sections: [
			{
				id: 'sammlung-oder-notiz',
				title: 'Was gehört in eine Stellensammlung?',
				html: '<p>Eine Sammlung ordnet Bibelstellen zu einer Frage oder einem Thema. Kommentare halten Gedanken zu den enthaltenen Versen fest. Eine <a href="/help/dokumente">Notiz</a> eignet sich dagegen für einen zusammenhängenden eigenen Text; eine <a href="/help/predigten">Ausarbeitung</a> ergänzt die Planung von Hauskreis oder Predigt.</p>'
			}
		]
	},
	{
		id: 'konto',
		topic: 'konto',
		path: '/help/konto',
		title: 'Konto & Einstellungen',
		description: 'Anmelden, Profil und persönliche Darstellung verwalten.',
		icon: 'user',
		audience: 'user',
		keywords: [
			'Registrierung',
			'E-Mail',
			'Code',
			'Passwort',
			'Datenschutz',
			'Schriftgröße',
			'Theme'
		],
		level: 'overview',
		anchors: {
			schnellstart: 'anmelden-und-profil-verwalten--schnellstart',
			bereiche: 'anmelden-und-profil-verwalten--profil',
			fragen: 'anmelden-und-profil-verwalten--fragen'
		},
		sections: []
	},
	{
		id: 'mobil',
		topic: 'mobil',
		path: '/help/mobil',
		title: 'Mobil & Tastatur',
		description: 'Unterwegs lesen und Akribos ohne Maus bedienen.',
		icon: 'maximize',
		audience: 'user',
		keywords: ['Smartphone', 'Tablet', 'Handy', 'Tastaturkürzel', 'Barrierefreiheit'],
		level: 'overview',
		anchors: {
			schnellstart: 'auf-smartphone-und-tablet-lesen--schnellstart',
			geraet: 'auf-smartphone-und-tablet-lesen--geraetewechsel'
		},
		sections: [
			{
				id: 'tastatur',
				title: 'Die wichtigsten Tastaturwege',
				html: '<table><thead><tr><th>Taste</th><th>Verwendung</th></tr></thead><tbody><tr><td>Tab / Umschalt + Tab</td><td>Zwischen bedienbaren Elementen wechseln</td></tr><tr><td>Enter</td><td>Eingabe im Stellen-/Suchfeld bestätigen oder einen fokussierten Link öffnen</td></tr><tr><td>Pfeil links / rechts in der Tab-Leiste</td><td>Zwischen Ressourcen-Tabs wechseln</td></tr><tr><td>Pos1 / Ende in der Tab-Leiste</td><td>Ersten oder letzten Ressourcen-Tab aktivieren</td></tr><tr><td>Pfeiltasten am fokussierten Trenner</td><td>Kachelgröße verändern</td></tr><tr><td>Escape</td><td>Geöffnete Menüs, Dialoge oder Fußnoten schließen</td></tr></tbody></table><p>Für eine Eingabe wählst du zuerst das passende Feld. Die Vor-/Zurück-Pfeile des Readers bedienen den Verlauf des jeweiligen Tabs.</p>'
			}
		]
	},
	{
		id: 'dokumente',
		topic: 'dokumente',
		path: '/help/dokumente',
		title: 'Notizen & Editor',
		description: 'Gedanken aufschreiben, ordnen und mit Bibeltext verbinden.',
		icon: 'file-text',
		audience: 'user',
		keywords: ['Dokumente', 'Schreiben', 'Tags', 'Schlagwörter', 'Markdown', 'Bibelzitat'],
		level: 'overview',
		anchors: {
			schnellstart: 'notizen-organisieren--schritte',
			orientierung: 'notizen-organisieren--bibliothek',
			speichern: 'editor-bedienen--speichern'
		},
		sections: []
	},
	{
		id: 'predigten',
		topic: 'predigten',
		path: '/help/predigten',
		title: 'Ausarbeitungen vorbereiten',
		description: 'Vom ersten Gedanken bis zur Durchführung.',
		icon: 'calendar',
		audience: 'user',
		keywords: ['Predigt', 'Vorbereitung', 'Board', 'Vorlagen', 'Termin', 'Gliederung'],
		level: 'overview',
		anchors: {
			schnellstart: 'ausarbeitung-planen--schritte',
			planung: 'ausarbeitung-planen--formate-planung'
		},
		sections: []
	},
	{
		id: 'import-export',
		episode: 13,
		topic: 'import-export',
		path: '/help/import-export',
		title: 'Import & Export',
		description: 'Dokumente mit Markdown, Word und PDF austauschen.',
		icon: 'download',
		audience: 'user',
		keywords: ['Obsidian', 'DOCX', 'ZIP', 'Archiv', 'Exportieren', 'Importieren'],
		level: 'overview',
		anchors: {
			schnellstart: 'dokumente-importieren--schritte',
			formate: 'dokumente-exportieren--format-waehlen'
		},
		sections: []
	},
	{
		id: 'probleme',
		topic: 'probleme',
		path: '/help/probleme',
		title: 'Häufige Fragen',
		description:
			'Probleme beim Lesen, bei der Anmeldung und beim Schreiben lösen. Feedback zu Akribos geben.',
		icon: 'info',
		audience: 'user',
		keywords: ['Problem', 'Hilfe', 'Fehler', 'FAQ'],
		level: 'overview',
		sections: [
			{
				id: 'eingrenzen',
				title: 'Das Problem zuerst eingrenzen',
				html: '<ol><li>Prüfe, in welchem Werk oder persönlichen Bereich du gerade arbeitest.</li><li>Beachte eine angezeigte Fehlermeldung und prüfe die Internetverbindung.</li><li>Wähle unten die passende Frage oder suche oben nach dem betroffenen Bedienelement.</li></ol><p>Bei nicht gespeicherten Texten lasse den Editor geöffnet, bis du die Meldung geprüft oder deinen Text anderweitig gesichert hast.</p>'
			},
			{
				id: 'lesen-und-suchen',
				title: 'Lesen und Suchen',
				html: '<details><summary>Eine Bibelstelle wird als Suchbegriff behandelt.</summary><p>Gib eine Kapitelzahl an, etwa „Joh 3“ statt „Johannes“. Mehr Beispiele stehen unter <a href="/help/bibelstellen#finden-und-weiterlesen">Stellenwahl</a>.</p></details><details><summary>Ein Tab folgt den anderen nicht oder springt unerwartet mit.</summary><p>Vergleiche seine Tabgruppe mit den anderen Tabs. Gleiche Buchstaben verbinden Stellen; „Keine“ liest unabhängig. Siehe <a href="/help/reader#werke-tabs-und-layouts--gruppen">Tabgruppen</a>.</p></details><details><summary>Eine Suche findet nichts.</summary><p>Prüfe Werk und Buchfilter und beginne mit einem kürzeren Begriff. Die <a href="/help/suchen#woerter-und-strong-finden--fragen">Suchhilfe</a> erklärt weitere Ursachen.</p></details><details><summary>Ein Wort zeigt keine Urtextinformationen.</summary><p>Es benötigt eine Strong-Zuordnung in dieser Bibelausgabe. Fehlende Grammatik ist ebenfalls von den verfügbaren Daten abhängig. Siehe <a href="/help/strong#wortstudie-durchfuehren--fragen">Wortstudie</a>.</p></details>'
			},
			{
				id: 'konto-und-dokumente',
				title: 'Konto und eigene Texte',
				html: '<details><summary>Mein Anmeldecode funktioniert nicht.</summary><p>Verwende die neueste E-Mail im ursprünglichen Browserdialog. Ältere, verwendete oder abgelaufene Codes gelten nicht mehr. Siehe <a href="/help/konto#anmelden-und-profil-verwalten--fragen">Anmeldehilfe</a>.</p></details><details><summary>Meine Notizen fehlen.</summary><p>Prüfe zuerst die E-Mail-Adresse deines angemeldeten Kontos und dann Such- oder Filtereinstellungen der Bibliothek. Auch der Papierkorb kann eine verschobene Notiz enthalten. Siehe <a href="/help/dokumente#notizen-organisieren">Notizen organisieren</a>.</p></details><details><summary>Im Editor steht „Speichern fehlgeschlagen“.</summary><p>Lasse den Tab geöffnet und prüfe die genaue Meldung sowie deine Verbindung. Bei abgelaufener Anmeldung musst du dich erneut anmelden. Eine Konfliktmeldung bedeutet, dass das Dokument anderweitig geändert wurde. Die <a href="/help/dokumente#editor-bedienen">Editor-Anleitung</a> erklärt die Rückmeldungen.</p></details>'
			},
			{
				id: 'kontakt',
				title: 'Feedback geben',
				episode: 15,
				html: '<ol><li>Bleib auf der betroffenen Seite und wähle angemeldet im Kontomenü <strong>Feedback geben</strong>.</li><li>Wähle die Art des Feedbacks. Bei einem Fehler im Werk gib auch die Ausgabe und die Bibelstelle an.</li><li>Beschreibe, was du beobachtest. Ergänze bei Bedarf einen Korrekturvorschlag und einen Screenshot bis zu 3 MB.</li><li>Wähle <strong>Feedback senden</strong>. Die Bestätigung zeigt, dass deine Meldung angekommen ist.</li></ol><p>Für andere Fragen wende dich über den <a href="/impressum">Kontakt im Impressum</a> an Akribos. Hilfreich sind die betroffene Funktion, die vorherigen Schritte, die genaue Fehlermeldung und dein Browser beziehungsweise Gerät. Sende keine Passwörter, Anmeldecodes oder API-Schlüssel mit.</p>'
			}
		]
	}
];
