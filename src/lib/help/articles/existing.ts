// Topic entry points retain the URLs and anchors of the original help.
import type { HelpArticle } from '../types';

export const existingArticles: HelpArticle[] = [
	{
		id: 'erste-schritte',
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
				title: 'Dein erster Studiengang',
				html: '<ol><li><a href="/Joh1">Öffne die Bibel</a>. Zum Lesen brauchst du kein Konto.</li><li>Gib im Feld eines Bibel-Tabs <code>Joh 3,16</code> ein und bestätige mit <kbd>Enter</kbd>.</li><li>Öffne über das Pluszeichen einen Kommentar oder eine zweite Bibel. Im Menü <strong>Kachelanordnung</strong> kannst du beide nebeneinander anzeigen.</li><li>Halte eine Beobachtung fest: Nach der <a href="/help/konto/anmelden-und-profil-verwalten">Anmeldung</a> kannst du Verse markieren und eigene Notizen schreiben.</li></ol>'
			},
			{
				id: 'dein-naechster-schritt',
				title: 'Womit möchtest du weitermachen?',
				html: '<p>Beginne mit <a href="/help/bibelstellen/finden-und-weiterlesen">Stellenwahl und Weiterlesen</a>, wenn du dich im Reader orientieren möchtest. Die Anleitung <a href="/help/reader/arbeitsbereich-einrichten">Einen Arbeitsbereich einrichten</a> begleitet dich beim Zusammenstellen deiner Werke. Für eine konkrete Frage findest du hier <a href="/help/suchen/woerter-und-strong-finden">die Suche</a>, <a href="/help/strong/wortstudie-durchfuehren">Wortstudien</a> und <a href="/help/dokumente/notizen-organisieren">persönliche Notizen</a>.</p>'
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
		sections: [
			{
				id: 'schnellstart',
				title: 'Direkt zu Kapitel oder Vers',
				html: '<ol><li>Wähle den gewünschten Bibel-Tab.</li><li>Gib zum Beispiel <code>Joh 3</code>, <code>Joh 3,16</code> oder <code>Joh 3,16-18</code> in sein Stellenfeld ein.</li><li>Bestätige mit <kbd>Enter</kbd>.</li></ol><p>Die Anleitung oben erklärt weitere Schreibweisen, den Verlauf jedes Tabs und das Nachschlagen von Querverweisen.</p>'
			},
			{
				id: 'buchnamen-suchen',
				title: 'Stellenangabe oder Suchwort?',
				html: '<p>Eine Stellenangabe im Reader braucht eine Kapitelzahl. <code>Judas 1</code> öffnet das Kapitel; <code>Judas</code> ohne Zahl startet eine Wortsuche. Verwende für Wörter und Wortfolgen die <a href="/help/suchen">Suchhilfe</a>.</p>'
			},
			{
				id: 'zwischen-kapiteln-wechseln',
				title: 'Beim Weiterlesen die Orientierung behalten',
				html: '<p>Beim Scrollen werden angrenzende Kapitel nachgeladen. Die Pfeile „Zurück“ und „Vor“ neben dem Stellenfeld gehören zum Verlauf dieses Tabs. Die <a href="/help/reader/werke-tabs-und-layouts#gruppen">Tabgruppe</a> entscheidet, welche weiteren Werke deiner Stelle folgen.</p>'
			}
		]
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
		sections: [
			{
				id: 'schnellstart',
				title: 'Bibel und Begleitwerke zusammenstellen',
				html: '<ol><li>Wähle im Reader über <strong>Kachelanordnung</strong> eine passende Ansicht.</li><li>Öffne mit dem Pluszeichen Bibeln, Kommentare, Parallelstellen oder Lexika als Tabs.</li><li>Verbinde zusammengehörige Tabs mit demselben Buchstaben A–E.</li><li>Speichere die Ansicht angemeldet über <strong>Arbeitsbereiche</strong> unter einem eigenen Namen.</li></ol><p>Die beiden Anleitungen oben führen dich durch ein vollständiges Beispiel und erklären anschließend alle Tab- und Layoutoptionen.</p>'
			},
			{
				id: 'orientierung',
				title: 'Die drei wichtigsten Begriffe',
				html: '<p>Ein <strong>Werk</strong> ist eine bestimmte Ausgabe, etwa eine Bibel oder ein Kommentar. Ein <strong>Tab</strong> hält dieses Werk mit seiner Stelle und Suche offen. Eine <strong>Kachel</strong> zeigt jeweils einen ihrer Tabs. So kannst du mehr Werke geöffnet halten, als gleichzeitig auf den Bildschirm passen.</p><p>Wenn ein Vergleichstext an einer anderen Stelle bleiben soll, wähle für seinen Tab eine andere Gruppe oder <strong>Keine</strong>. Auf dem Smartphone sind die Tabs aller Kacheln in einer gemeinsamen Leiste erreichbar.</p>'
			},
			{
				id: 'textgroesse-und-farbschema',
				title: 'Textgröße und Farbschema',
				html: '<p>A− und A+ vergrößern oder verkleinern den Lesetext. Das Sonnen-/Mondsymbol wechselt das Design. Weitere Angaben zur persönlichen Darstellung und Standardübersetzung findest du unter <a href="/help/konto/leseansicht-anpassen">Leseansicht anpassen</a>.</p>'
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
		sections: [
			{
				id: 'schnellstart',
				title: 'Ein Wort aus dem Bibeltext untersuchen',
				html: '<ol><li>Öffne eine Bibel mit Strong-Zuordnungen.</li><li>Klicke auf ein verknüpftes Wort.</li><li>Lies den Eintrag im geöffneten Lexikon-Tab und scrolle zu Grammatik, Übersetzungsformen und Fundstellen.</li></ol><p>Die Wortstudie verbindet einen konkreten Klick im Bibeltext mit dem gewählten Lexikon. Welche Angaben erscheinen, hängt von den verfügbaren Daten ab.</p>'
			},
			{
				id: 'was-die-angaben-bedeuten',
				title: 'Die Quelle deiner Angaben erkennen',
				html: '<p><strong>G</strong> kennzeichnet griechische, <strong>H</strong> hebräische Strong-Einträge. Bedeutung und Herkunft stammen aus dem geöffneten Lexikon. Vorkommen und Übersetzungsformen beziehen sich auf die angezeigte Quellbibel. Grammatik beschreibt, soweit vorhanden, die Wortform an der angeklickten Stelle.</p>'
			},
			{
				id: 'keine-angaben',
				title: 'Wenn ein Wort keine Studie öffnet',
				html: '<p>Nicht jede Ausgabe hat Strong-Zuordnungen und nicht jedes Wort ist verknüpft. Probiere eine entsprechend ausgestattete Bibel oder gib eine bekannte Nummer direkt in ein passendes Lexikon ein. Die Anleitung oben erklärt auch fehlende Grammatik, unabhängige Lexikon-Tabs und die eigenständigen Strong-Seiten.</p>'
			}
		]
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
		sections: [
			{
				id: 'schnellstart',
				title: 'Im gewünschten Werk suchen',
				html: '<ol><li>Wähle den Bibel- oder Kommentar-Tab, den du durchsuchen möchtest.</li><li>Gib ein Wort wie <code>gnade</code> in sein Stellen- und Suchfeld ein.</li><li>Bestätige mit <kbd>Enter</kbd> und öffne eine Fundstelle.</li></ol><p>Die Suche zeigt Ergebnisse dieses Werks im selben Tab. Andere geöffnete Werke behalten ihre Ansicht.</p>'
			},
			{
				id: 'syntax',
				title: 'Den Suchbereich sinnvoll eingrenzen',
				html: '<p><code>gnade wahrheit</code> sucht beide Wörter; <code>"am Anfang"</code> sucht eine Wortfolge. Mit <code>liebe -welt</code> schließt du einen Begriff aus. Das Buchdiagramm filtert die Trefferliste auf ein bestimmtes Buch. In Bibeln mit Strong-Zuordnungen kannst du auch <code>G25</code> oder <code>H430</code> eingeben.</p>'
			},
			{
				id: 'keine-treffer',
				title: 'Keine Treffer?',
				html: '<p>Prüfe das gewählte Werk und einen aktiven Buchfilter. Verkürze den Suchausdruck oder probiere einen Wortanfang. Das × an der Ergebnisübersicht bringt deinen Lesetext zurück; der Tab-Verlauf hilft beim Wiederaufrufen einer Suche.</p>'
			}
		]
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
		sections: [
			{
				id: 'schnellstart',
				title: 'Das Versmenü öffnen',
				html: '<ol><li>Klicke oder tippe auf eine Versnummer. Für Vers 1 wählst du die große Kapitelzahl.</li><li>Kopiere den Vers oder seinen Link.</li><li>Angemeldet kannst du außerdem eine Markierungsfarbe wählen, eine Notiz zur Stelle öffnen oder den Vers in eine Stellensammlung aufnehmen.</li></ol><p>Ein Klick auf ein Strong-Wort öffnet dagegen die Wortstudie. Für Aktionen am ganzen Vers verwendest du seine Nummer.</p>'
			},
			{
				id: 'eigene-markierungsfarben-verwalten',
				title: 'Wichtige Stellen mit Farben ordnen',
				html: '<p>Unter <strong>Mein Konto → Darstellung → Versmarkierungen</strong> benennst du Farben und findest über <strong>Verse anzeigen</strong> die zugehörigen Stellen. Eine bereits aktive Farbe wählst du im Versmenü noch einmal, um die Markierung zu entfernen. Die aktuelle Oberfläche erstellt Markierungen für ganze Verse.</p>'
			},
			{
				id: 'private-notizen-neben-dem-bibeltext',
				title: 'Eine Beobachtung festhalten',
				html: '<p>Für ausführlichere Gedanken öffnest du über das Versmenü die Notizen zur Stelle. Eine Stellensammlung hält mehrere Verse für eine gemeinsame Fragestellung zusammen. Die nächsten Anleitungen findest du unter <a href="/help/dokumente">Notizen &amp; Editor</a> und <a href="/help/listen">Stellensammlungen</a>.</p>'
			}
		]
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
		sections: [
			{
				id: 'schnellstart',
				title: 'Eine Sammlung mit deinem ersten Vers beginnen',
				html: '<ol><li>Melde dich an und öffne einen interessanten Bibelvers.</li><li>Öffne sein Versmenü und wähle <strong>Neue Liste mit diesem Vers</strong>.</li><li>Bearbeite die Sammlung unter <a href="/lists">Stellensammlungen</a>.</li></ol><p>Du kannst auch direkt in der Übersicht eine <strong>Neue Stellensammlung</strong> anlegen und anschließend Stellen hinzufügen.</p>'
			},
			{
				id: 'sammlung-oder-notiz',
				title: 'Was gehört in eine Stellensammlung?',
				html: '<p>Eine Sammlung ordnet Bibelstellen zu einer Frage oder einem Thema. Kommentare halten Gedanken zu den enthaltenen Versen fest. Eine <a href="/help/dokumente">Notiz</a> eignet sich dagegen für einen zusammenhängenden eigenen Text; eine <a href="/help/predigten">Ausarbeitung</a> ergänzt die Planung von Hauskreis oder Predigt.</p>'
			},
			{
				id: 'zusammenarbeit',
				title: 'Allein arbeiten oder andere beteiligen',
				html: '<p>Eine neue Sammlung ist zunächst dein eigener Arbeitsstand. Du bestimmst anschließend ihre Sichtbarkeit und wer mitarbeiten darf. Die Anleitung zur Zusammenarbeit erklärt Einladungen, Rollen und Freigaben getrennt vom Anlegen und Ordnen der Stellen.</p>'
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
		sections: [
			{
				id: 'schnellstart',
				title: 'Anmelden und die Einstellungen finden',
				html: '<ol><li>Öffne <a href="/login">Anmelden</a>, gib deine E-Mail-Adresse ein und wähle <strong>Weiter</strong>.</li><li>Bestätige mit dem angeforderten E-Mail-Code beziehungsweise mit deinem vorhandenen Passwort.</li><li>Öffne anschließend im Konto-Menü <strong>Mein Konto</strong>.</li></ol><p>Der erste bestätigte Zugang erstellt dein Konto. Lesen, Suchen und verfügbare Lexika kannst du schon vorher verwenden.</p>'
			},
			{
				id: 'bereiche',
				title: 'Profil oder Darstellung?',
				html: '<p><strong>Profil &amp; Sicherheit</strong> enthält Anzeigenamen, Passwort und API-Schlüssel. Unter <strong>Darstellung</strong> findest du Design, Textgröße, Standardübersetzung und Markierungsfarben. Deine Notizen und Ausarbeitungen sind im Konto-Menü separat erreichbar.</p><p>Die beiden Anleitungen oben erklären den vollständigen Anmeldeweg, die Verwaltung des Zugangs und die einzelnen Darstellungseinstellungen.</p>'
			},
			{
				id: 'fragen',
				title: 'Wenn der Zugang nicht klappt',
				html: '<p>Benutze immer die neueste Anmelde-E-Mail. Der Code gehört zum Browserdialog, aus dem sie angefordert wurde; Link und Code sind 15 Minuten gültig und einmal verwendbar. Weitere Lösungen stehen unter <a href="/help/konto/anmelden-und-profil-verwalten#fragen">Probleme bei der Anmeldung</a>.</p>'
			}
		]
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
		sections: [
			{
				id: 'schnellstart',
				title: 'Unterwegs lesen',
				html: '<ol><li>Öffne den Reader auf deinem Smartphone oder Tablet.</li><li>Wähle dein Werk in der gemeinsamen Tab-Leiste.</li><li>Gib eine Stelle oder einen Suchbegriff im Feld darunter ein.</li><li>Tippe für ein anderes Werk auf dessen Tabnamen.</li></ol><p>Die schmale Ansicht zeigt jeweils einen Tab. Deine Anordnung für größere Bildschirme bleibt gespeichert.</p>'
			},
			{
				id: 'tastatur',
				title: 'Die wichtigsten Tastaturwege',
				html: '<table><thead><tr><th>Taste</th><th>Verwendung</th></tr></thead><tbody><tr><td>Tab / Umschalt + Tab</td><td>Zwischen bedienbaren Elementen wechseln</td></tr><tr><td>Enter</td><td>Eingabe im Stellen-/Suchfeld bestätigen oder einen fokussierten Link öffnen</td></tr><tr><td>Pfeil links / rechts in der Tab-Leiste</td><td>Zwischen Ressourcen-Tabs wechseln</td></tr><tr><td>Pos1 / Ende in der Tab-Leiste</td><td>Ersten oder letzten Ressourcen-Tab aktivieren</td></tr><tr><td>Pfeiltasten am fokussierten Trenner</td><td>Kachelgröße verändern</td></tr><tr><td>Escape</td><td>Geöffnete Menüs, Dialoge oder Fußnoten schließen</td></tr></tbody></table><p>Für eine Eingabe wählst du zuerst das passende Feld. Die Vor-/Zurück-Pfeile des Readers bedienen den Verlauf des jeweiligen Tabs.</p>'
			},
			{
				id: 'geraet',
				title: 'Lesedarstellung auf deinem Gerät',
				html: '<p>Textgröße und Design können auf Smartphone und Computer unterschiedlich bleiben. Passe sie unter <a href="/help/konto/leseansicht-anpassen">Mein Konto → Darstellung</a> an. Akribos lädt weitere Kapitel und Suchergebnisse über die Internetverbindung; die mobile Ansicht ist keine vollständige Offline-Bibliothek.</p>'
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
		sections: [
			{
				id: 'schnellstart',
				title: 'Die erste eigene Notiz schreiben',
				html: '<ol><li>Melde dich an und öffne im Konto-Menü <strong>Notizen &amp; Ausarbeitungen</strong>.</li><li>Wähle <strong>Neue Notiz</strong>.</li><li>Vergib einen Titel, schreibe deinen Gedanken und beachte die Speicheranzeige im Editor.</li></ol><p>Alternativ beginnst du über das Versmenü direkt an einer Bibelstelle. So bleibt dein Gedanke mit dem gelesenen Text verbunden.</p>'
			},
			{
				id: 'orientierung',
				title: 'Schreiben, verbinden und wiederfinden',
				html: '<p>Die Bibliothek hilft dir beim Suchen und Ordnen deiner Texte. Der Editor bietet Formatierung, Listen und Bibelzitate. Bibelstellen und Verknüpfungen verbinden eine Notiz mit deinem Studium. Die drei Anleitungen oben führen durch diese Aufgaben; sie gelten auch für den Editor im Notizbereich neben dem Reader.</p>'
			},
			{
				id: 'speichern',
				title: 'Auf die Speicheranzeige achten',
				html: '<p>Deine Änderungen werden automatisch gespeichert. Warte auf <strong>Gespeichert</strong>, bevor du die Arbeit beendest. Bei einem Speicherfehler bleiben Änderungen zunächst im geöffneten Editor. Prüfe die Meldung und die Verbindung, statt den Tab sofort zu schließen.</p><p>Eine <a href="/help/predigten">Ausarbeitung</a> nutzt denselben Texteditor und ergänzt Planung, Vorlagen und Durchführung.</p>'
			}
		]
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
		sections: [
			{
				id: 'schnellstart',
				title: 'Eine Ausarbeitung beginnen',
				html: '<ol><li>Öffne <strong>Notizen &amp; Ausarbeitungen</strong> und wähle die Ausarbeitungen.</li><li>Lege eine <strong>Neue Ausarbeitung</strong> an.</li><li>Trage Titel, Bibelstellen und erste Gedanken ein.</li><li>Ergänze den Arbeitsstand und einen geplanten Termin, sobald sie feststehen.</li></ol><p>Eine Ausarbeitung kann ein Hauskreisabend, eine Bibelstunde oder eine Predigt sein. Du kannst zunächst mit einer Idee beginnen und die Planung später ergänzen.</p>'
			},
			{
				id: 'planung',
				title: 'Inhalt und Vorbereitung zusammenhalten',
				html: '<p>Das Board zeigt den Arbeitsstand deiner Ausarbeitungen. Termine, Reihen und Durchführungen ergänzen deinen geschriebenen Text. Vorlagen helfen bei wiederkehrenden Strukturen; Anlagen halten passendes Material beim Dokument.</p><p>Die Anleitungen oben behandeln den Weg von der Idee zur Durchführung sowie die Arbeit mit Vorlagen und Materialien. Grundlegende Schreibwerkzeuge findest du unter <a href="/help/dokumente/editor-bedienen">Editor bedienen</a>.</p>'
			}
		]
	},
	{
		id: 'import-export',
		topic: 'import-export',
		path: '/help/import-export',
		title: 'Import & Export',
		description: 'Dokumente mit Markdown, Word und PDF austauschen.',
		icon: 'download',
		audience: 'user',
		keywords: ['Obsidian', 'DOCX', 'ZIP', 'Archiv', 'Exportieren', 'Importieren'],
		level: 'overview',
		sections: [
			{
				id: 'schnellstart',
				title: 'Vorhandene Texte übernehmen',
				html: '<ol><li>Öffne <a href="/notes/import">Word und Markdown importieren</a>.</li><li>Wähle deine Dateien und erstelle die Importvorschau.</li><li>Prüfe Text, erkannte Metadaten und Hinweise.</li><li>Bestätige den Import als privates Dokument.</li></ol><p>Die Vorschau zeigt die Konvertierung, bevor neue Dokumente entstehen. Die ausführliche Anleitung erklärt Dateiformate, Grenzen und den Umgang mit nicht übernommenen Bestandteilen.</p>'
			},
			{
				id: 'formate',
				title: 'Welches Format passt zu deinem Vorhaben?',
				html: '<p><strong>Word (.docx)</strong> und <strong>Markdown (.md)</strong> eignen sich zum Import vorhandener Texte. Ein <strong>ZIP-Archiv</strong> kann mehrere Markdown-Dateien enthalten. Für die Ausgabe stehen je nach Aufgabe <strong>Markdown</strong>, <strong>Word</strong> und <strong>PDF</strong> bereit.</p><p>Markdown eignet sich zum Weiterverwenden in textbasierten Werkzeugen; Word und PDF bieten lesbare Ausgaben. Der Export speichert nicht automatisch eine vollständige Sicherung aller Kontodaten. Die Import- und Exportanleitungen oben nennen jeweils genau, was enthalten ist.</p>'
			}
		]
	},
	{
		id: 'probleme',
		topic: 'probleme',
		path: '/help/probleme',
		title: 'Häufige Fragen',
		description: 'Antworten auf Fragen aus dem Lesealltag.',
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
				html: '<details><summary>Eine Bibelstelle wird als Suchbegriff behandelt.</summary><p>Gib eine Kapitelzahl an, etwa „Joh 3“ statt „Johannes“. Mehr Beispiele stehen unter <a href="/help/bibelstellen/finden-und-weiterlesen">Stellenwahl</a>.</p></details><details><summary>Ein Tab folgt den anderen nicht oder springt unerwartet mit.</summary><p>Vergleiche seine Tabgruppe mit den anderen Tabs. Gleiche Buchstaben verbinden Stellen; „Keine“ liest unabhängig. Siehe <a href="/help/reader/werke-tabs-und-layouts#gruppen">Tabgruppen</a>.</p></details><details><summary>Eine Suche findet nichts.</summary><p>Prüfe Werk und Buchfilter und beginne mit einem kürzeren Begriff. Die <a href="/help/suchen/woerter-und-strong-finden#fragen">Suchhilfe</a> erklärt weitere Ursachen.</p></details><details><summary>Ein Wort zeigt keine Urtextinformationen.</summary><p>Es benötigt eine Strong-Zuordnung in dieser Bibelausgabe. Fehlende Grammatik ist ebenfalls von den verfügbaren Daten abhängig. Siehe <a href="/help/strong/wortstudie-durchfuehren#fragen">Wortstudie</a>.</p></details>'
			},
			{
				id: 'konto-und-dokumente',
				title: 'Konto und eigene Texte',
				html: '<details><summary>Mein Anmeldecode funktioniert nicht.</summary><p>Verwende die neueste E-Mail im ursprünglichen Browserdialog. Ältere, verwendete oder abgelaufene Codes gelten nicht mehr. Siehe <a href="/help/konto/anmelden-und-profil-verwalten#fragen">Anmeldehilfe</a>.</p></details><details><summary>Meine Notizen fehlen.</summary><p>Prüfe zuerst die E-Mail-Adresse deines angemeldeten Kontos und dann Such- oder Filtereinstellungen der Bibliothek. Auch der Papierkorb kann eine verschobene Notiz enthalten. Siehe <a href="/help/dokumente/notizen-organisieren">Notizen organisieren</a>.</p></details><details><summary>Im Editor steht „Speichern fehlgeschlagen“.</summary><p>Lasse den Tab geöffnet und prüfe die genaue Meldung sowie deine Verbindung. Bei abgelaufener Anmeldung musst du dich erneut anmelden. Eine Konfliktmeldung bedeutet, dass das Dokument anderweitig geändert wurde. Die <a href="/help/dokumente/editor-bedienen">Editor-Anleitung</a> erklärt die Rückmeldungen.</p></details>'
			},
			{
				id: 'kontakt',
				title: 'Eine Frage bleibt offen',
				html: '<p>Wende dich über den <a href="/impressum">Kontakt im Impressum</a> an Akribos. Hilfreich sind die betroffene Funktion, die vorherigen Schritte, die genaue Fehlermeldung und dein Browser beziehungsweise Gerät. Sende keine Passwörter, Anmeldecodes oder API-Schlüssel mit.</p>'
			}
		]
	}
];
