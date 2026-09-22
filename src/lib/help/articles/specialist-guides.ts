import type { HelpArticle } from '../types';

/** Specialist workflows checked against their current forms and server actions. */
export const specialistGuides: HelpArticle[] = [
	{
		id: 'api-schluessel-verwenden',
		topic: 'api',
		path: '/help/api/api-schluessel-verwenden',
		title: 'API-Schlüssel erstellen und Daten abrufen',
		description:
			'Wähle den passenden Zugriff, verbinde deine Anwendung mit der lesenden API und behandle Fehler sowie Anfragelimits.',
		icon: 'code',
		audience: 'api',
		level: 'guide',
		keywords: [
			'API',
			'Integration',
			'Schlüssel',
			'Token',
			'Bearer',
			'public',
			'personal',
			'Rate Limit',
			'JSON',
			'Widerrufen'
		],
		prerequisite:
			'Ein angemeldetes Konto für die Schlüsselverwaltung und eine Anwendung, die HTTP-Anfragen senden kann.',
		sections: [
			{
				id: 'erstellen',
				title: '1. Einen Schlüssel für deine Anwendung erstellen',
				html: `<ol><li>Öffne <a href="/account">Profil &amp; Sicherheit</a> und gehe zum Bereich <strong>API-Schlüssel</strong>.</li><li>Vergib einen erkennbaren <strong>Namen</strong>, zum Beispiel „Meine Studienanwendung“.</li><li>Wähle unter <strong>Zugriff</strong> den benötigten Umfang. Für öffentliche Bibeltexte genügt <strong>Nur öffentliche Inhalte</strong>.</li><li>Klicke auf <strong>Schlüssel erstellen</strong>.</li><li>Kopiere den vollständigen Schlüssel aus der Bestätigung und hinterlege ihn in der dafür vorgesehenen Geheimnisverwaltung deiner Anwendung.</li></ol><p>Der vollständige Schlüssel wird nur unmittelbar nach dem Erstellen angezeigt. Später siehst du lediglich seinen Anfang, den Namen, den Zugriffsumfang und Nutzungsdaten. Ein verlorener Schlüssel lässt sich nicht erneut auslesen; erstelle dafür einen Ersatz und widerrufe den alten Eintrag.</p><p>Bis zu 20 aktive Schlüssel können zu einem Konto gehören. Ein eigener Schlüssel je Anwendung erleichtert das gezielte Abschalten eines Zugangs.</p>`,
				screenshot: {
					src: '/help/live/api-key-form.webp',
					width: 384,
					height: 228,
					alt: 'API-Schlüsselformular mit dem Beispielnamen Mein Bibelstudium und ausgewähltem Zugriff auf öffentliche Inhalte.',
					caption:
						'Name und Zugriff werden vor dem Erstellen festgelegt. Die Aufnahme zeigt keinen erzeugten Schlüssel.'
				}
			},
			{
				id: 'zugriff',
				title: '2. Öffentlichen und persönlichen Zugriff unterscheiden',
				html: `<dl class="definition-list"><div><dt>Nur öffentliche Inhalte · public</dt><dd>Liest die von der API unterstützten öffentlichen Bibeltexte, Nachschlagewerke und Suchergebnisse. Individuelle Freigaben des Schlüsselinhabers werden nicht übernommen.</dd></div><div><dt>Auch persönliche Daten · personal</dt><dd>Liest zusätzlich eigene Notizen, Ausarbeitungen und Markierungen, eigene Stellensammlungen, Sammlungen mit angenommener Mitgliedschaft sowie die unterstützten eigenen Kommentare. Bei Ressourcen werden außerdem die individuellen Freigaben des Kontos berücksichtigt.</dd></div></dl><p>Ein persönlicher Schlüssel handelt für das Konto, das ihn erstellt hat. Er gewährt weder Zugriff auf fremde private Dokumente noch allgemeine Verwaltungsrechte. Ein gesperrtes Konto kann seine Schlüssel beider Zugriffsumfänge nicht verwenden.</p><aside class="callout"><strong>Schlüssel gehören nicht in öffentlich ausgelieferten Code.</strong><p>Insbesondere persönliche Schlüssel dürfen nicht in einem JavaScript-Bundle, geteilten Dokument, Screenshot oder öffentlichen Repository stehen. Verwende sie auf der vertrauenswürdigen Serverseite deiner Integration.</p></aside>`
			},
			{
				id: 'erste-anfrage',
				title: '3. Die erste Anfrage senden',
				html: `<ol><li>Sende eine <code>GET</code>-Anfrage an <code>https://akribos.de/api/v1/resources</code>.</li><li>Setze den HTTP-Header <code>Authorization: Bearer DEIN_API_SCHLUESSEL</code> und ersetze den Platzhalter durch deinen vollständigen Schlüssel.</li><li>Lies die Ressourcen-IDs aus der JSON-Antwort. Verwende diese IDs für weitere Abfragen.</li><li>Rufe <code>/api/v1/books</code> auf, um die Buch-IDs und Kapitelzahlen zu erhalten.</li><li>Öffne die <a href="/api/docs">interaktive API-Referenz</a> für die Parameter und Antwortfelder des benötigten Endpunkts.</li></ol><p>Schlüssel werden im Header übertragen. Ein öffentliches Werk kann trotzdem eigenen Nutzungshinweisen unterliegen; die Ressourcenantwort enthält die hinterlegten Lizenzangaben. Ein privates Werk erscheint nur bei aktuell berechtigtem persönlichem Zugriff. Zusätzlich muss jedes Werk für die öffentliche API freigegeben sein. Die Lesbarkeit im Reader allein genügt nicht; diese Grenze gilt auch für persönliche Schlüssel.</p>`
			},
			{
				id: 'endpunkte',
				title: 'Welche Daten die API bereitstellt',
				html: `<p>Die öffentliche API unter <code>/api/v1</code> bietet lesende <code>GET</code>-Endpunkte. Die IDs in geschweiften Klammern sind durch die passenden Werte zu ersetzen.</p><dl class="definition-list"><div><dt><code>/books</code></dt><dd>Bibelbücher mit Kennung, Namen, Testament und Kapitelzahl.</dd></div><div><dt><code>/resources</code></dt><dd>Verfügbare Ressourcen mit Art, Kennung, Sprache und Metadaten.</dd></div><div><dt><code>/bibles/{bible}/{book}/{chapter}</code></dt><dd>Ein Kapitel einer Bibel, einschließlich strukturierter Verse und vorhandener Überschriften.</dd></div><div><dt><code>/strong/{id}</code></dt><dd>Lexikondaten und Vorkommen zu einer Strong-Nummer wie G26 oder H430. <code>resources</code> bestimmt die Übersetzungsauswahl, <code>ref</code> ergänzt den Stellenkontext und <code>page</code> blättert durch Vorkommen.</dd></div><div><dt><code>/search</code></dt><dd>Volltextsuche mit <code>q</code>; optional begrenzen <code>bibles</code>, <code>book</code> und <code>page</code> Auswahl, Bibelbuch und Ergebnisseite. Suchwerte müssen als URL-Parameter codiert werden.</dd></div><div><dt><code>/lists</code></dt><dd>Eigene Stellensammlungen und Sammlungen mit angenommener Mitgliedschaft; benötigt persönlichen Zugriff.</dd></div><div><dt><code>/lists/{id}</code></dt><dd>Stellen einer verfügbaren Sammlung. Bei privaten Sammlungen braucht dein Konto Eigentum oder eine angenommene Einladung zur Mitarbeit. <code>bible</code> wählt den beigefügten Bibeltext. Diskussionen und Reaktionen gehören nicht zu dieser Antwort.</dd></div><div><dt><code>/documents</code></dt><dd>Eigene Notizen und Ausarbeitungen als Übersicht mit Text und Metadaten. <code>kind=note</code> oder <code>kind=sermon</code> begrenzt den Typ, <code>q</code> durchsucht Titel, Inhalt und Schlagwörter. <code>visibility</code> filtert private oder nicht gelistete Arbeitskopien; <code>deleted=only</code> beziehungsweise <code>include</code> bezieht den Papierkorb ein. Persönlicher Zugriff ist erforderlich.</dd></div><div><dt><code>/documents/{id}</code></dt><dd>Eine eigene, nicht gelöschte Arbeitskopie mit Markdown, HTML, Schlagwörtern und verknüpften Bibelstellen. Fremde Dokumente sind nicht abrufbar. Ein freigegebener Schnappschuss ist von dieser persönlichen Arbeitskopie getrennt.</dd></div><div><dt><code>/highlights</code></dt><dd>Eigene markierte Verse für eine Farbe. Gib mit <code>style</code> eine eigene Farb-ID oder mit <code>color</code> den Farbwert an; <code>resource</code> wählt optional eine verfügbare Bibel für den beigefügten Text. Persönlicher Zugriff ist erforderlich.</dd></div><div><dt><code>/notes</code></dt><dd>Eigene übersetzungsbezogene Verskommentare und selbst verfasste Sammlungsbeiträge. Für die heutige Bibliothek mit Notizen und Ausarbeitungen verwendest du stattdessen die Dokumentendpunkte.</dd></div></dl><p>Erstellen, Bearbeiten und Löschen von Dokumenten oder Sammlungen gehören nicht zum Umfang dieser API. Verwende dafür die Akribos-Oberfläche. Die <a href="/api/docs">API-Referenz</a> beschreibt die genauen Antwortformate.</p>`
			},
			{
				id: 'fehler',
				title: 'Fehler und Anfragelimits behandeln',
				html: `<p>Pro API-Schlüssel sind <strong>120 Anfragen pro Minute</strong> vorgesehen. Bei <code>429</code> liest deine Anwendung den Header <code>Retry-After</code> und wartet die dort genannten Sekunden, bevor sie erneut anfragt.</p><dl class="definition-list"><div><dt>401 · Anmeldung fehlt</dt><dd>Prüfe den Bearer-Header und ob der Schlüssel vollständig, gültig und nicht widerrufen ist. Auch eine Kontosperre macht den Schlüssel ungültig.</dd></div><div><dt>403 · Persönlicher Zugriff nötig</dt><dd>Ein Endpunkt für persönliche Daten wurde ohne den erforderlichen persönlichen Zugriff aufgerufen.</dd></div><div><dt>404 · Nicht verfügbar</dt><dd>Prüfe IDs und aktuelle Berechtigungen. Eine private, für das Konto nicht verfügbare Sammlung wird ebenfalls als nicht gefunden beantwortet.</dd></div><div><dt>400 · Eingabe prüfen</dt><dd>Prüfe die Parameter und lies die zurückgegebene Fehlermeldung.</dd></div><div><dt>429 · Zu viele Anfragen</dt><dd>Warte gemäß <code>Retry-After</code> und reduziere gleichzeitige Anfragen oder wiederholte Abfragen.</dd></div></dl><p>API-Fehler enthalten ein Objekt <code>error</code> mit <code>code</code> und <code>message</code>. Werte zuerst den HTTP-Status aus und verwende den Fehlercode für die Behandlung in deiner Anwendung.</p><p>Antworten für persönliche Schlüssel werden mit <code>Cache-Control: private, no-store</code> ausgeliefert. Bewahre solche Antworten nicht in einem öffentlich geteilten Cache auf. Ein kopierter Reader-Link oder ein Origin-Header ersetzt keine Freigabe für private Inhalte.</p>`
			},
			{
				id: 'widerrufen',
				title: 'Einen Schlüssel ersetzen oder widerrufen',
				html: `<ol><li>Öffne erneut <strong>Profil &amp; Sicherheit → API-Schlüssel</strong>.</li><li>Identifiziere den Eintrag anhand von Name, Schlüsselanfang und „Zuletzt verwendet“.</li><li>Wenn die Anwendung weiterlaufen soll, erstelle zunächst einen neuen Schlüssel und stelle sie auf diesen um.</li><li>Klicke beim alten Schlüssel auf <strong>Widerrufen</strong>.</li></ol><p>Der alte Schlüssel kann danach nicht erneut aktiviert werden. Die Liste zeigt das Widerrufsdatum weiterhin an. Ist ein Schlüssel unbeabsichtigt weitergegeben worden, widerrufe ihn direkt; ein bloßes Entfernen aus deiner lokalen Konfiguration beendet seine Gültigkeit nicht.</p>`
			}
		]
	},
	{
		id: 'ressourcen-verwalten',
		topic: 'administration',
		path: '/help/administration/ressourcen-verwalten',
		title: 'Werke anordnen, beschriften und freigeben',
		description:
			'Verwalte die Darstellung der Ressourcen, ihre Reihenfolge und den Zugriff auf öffentliche oder privat freigegebene Werke.',
		icon: 'book',
		audience: 'admin',
		level: 'guide',
		keywords: [
			'Ressourcen',
			'Werke',
			'Cover',
			'Titel',
			'Reihenfolge',
			'Sortierung',
			'Freigabe',
			'privat',
			'Grant',
			'Löschen',
			'Statistiken'
		],
		prerequisite: 'Ein Konto mit Administratorrolle und mindestens ein importiertes Werk.',
		sections: [
			{
				id: 'finden',
				title: '1. Das richtige Werk auswählen',
				html: `<ol><li>Öffne <a href="/admin/resources">Administration → Ressourcen</a>.</li><li>Suche nach Name, Bezeichner oder Sprache. Mit den Kategorien grenzt du Bibeln, Kommentare, Parallelstellen, Lexika und Morphologie ein.</li><li>Wähle das Werk in der Liste aus. Sein Bearbeitungsbereich erscheint daneben; auf schmalen Geräten wird dorthin gescrollt.</li><li>Prüfe vor dem Ändern den Bezeichner unter dem Titel. Er unterscheidet auch ähnlich benannte Ausgaben.</li></ol><p>Die Kopfzeile nennt Art, Sprache und die hinterlegten Vers- beziehungsweise Eintragszahlen. Das Kennzeichen <strong>privat</strong> in der Liste zeigt, dass „Öffentlich sichtbar“ ausgeschaltet ist.</p>`
			},
			{
				id: 'beschriften',
				title: '2. Titel und Rechtehinweis bearbeiten',
				html: `<ol><li>Bearbeite die benötigten Felder im ausgewählten Werk.</li><li>Kontrolliere die Einstellung <strong>Öffentlich sichtbar</strong> im selben Formular.</li><li>Klicke auf <strong>Änderungen speichern</strong> und warte auf die Bestätigung.</li><li>Öffne die Werkauswahl im Reader und prüfe die Darstellung.</li></ol><dl class="definition-list"><div><dt>Cover-Titel</dt><dd>Die kompakte Beschriftung auf dem Buchcover in der Werkauswahl.</dd></div><div><dt>Tab-Titel</dt><dd>Der kurze Name des geöffneten Reader-Tabs.</dd></div><div><dt>Titel in der Auswahl</dt><dd>Der ausführliche Werktitel in der Auswahl. Er kann sich vom kurzen Tab-Titel unterscheiden.</dd></div><div><dt>Untertitel in der Auswahl</dt><dd>Ergänzende Information, etwa Ausgabe oder Übersetzer. Das Feld darf bewusst leer bleiben.</dd></div><div><dt>Rechtehinweis</dt><dd>Hinterlegte Quellen- und Nutzungshinweise des Werks. Prüfe diese Angaben vor einer öffentlichen Freigabe.</dd></div></dl><p>Bezeichner, Art und Sprache sind hier keine editierbaren Darstellungsfelder. Die Seite ersetzt auch keinen Inhaltsimport: Eine Änderung am Titel verändert den Bibeltext nicht.</p>`,
				screenshot: {
					src: '/help/media/admin-resource.webp',
					width: 618,
					height: 401,
					alt: 'Metadatenformular einer Bibel mit Cover-Titel, Tab-Titel, Auswahltexten, Rechtehinweis und öffentlicher Sichtbarkeit.',
					caption:
						'Darstellung und öffentliche Sichtbarkeit speicherst du gemeinsam. Private Freigaben haben ein eigenes Formular.'
				}
			},
			{
				id: 'reihenfolge',
				title: '3. Die Reihenfolge festlegen',
				html: `<ol><li>Suche das Werk in der Ressourcenliste.</li><li>Verwende den Pfeil nach oben oder unten neben dem Eintrag.</li><li>Wiederhole den Schritt bis zur gewünschten Position.</li></ol><p>Die Pfeile verändern die Reihenfolge innerhalb der jeweiligen Ressourcenart. Eine Bibel wird also mit anderen Bibeln angeordnet. Jeder Klick wird direkt gespeichert; „Änderungen speichern“ gehört zum separaten Metadatenformular.</p><p>Die Sortierung beeinflusst die Werkauswahl und die bevorzugte Auswahl von Ressourcen, etwa beim Aufbau eines neuen Arbeitsbereichs. Bereits persönlich gespeicherte Tabs werden dadurch nicht neu angeordnet.</p>`
			},
			{
				id: 'freigabe',
				title: 'Öffentliche und private Freigaben verwalten',
				html: `<h3>Ein Werk öffentlich anbieten</h3><ol><li>Aktiviere im Metadatenformular <strong>Öffentlich sichtbar</strong>.</li><li>Bestätige mit <strong>Änderungen speichern</strong>.</li></ol><h3>Ein Werk nur ausgewählten Konten bereitstellen</h3><ol><li>Schalte <strong>Öffentlich sichtbar</strong> aus und speichere diese Änderung.</li><li>Wähle im eigenen Abschnitt <strong>Private Freigabe</strong> die berechtigten Konten aus.</li><li>Klicke auf <strong>Private Freigaben speichern</strong>.</li></ol><p>Die beiden Formulare speichern unabhängig voneinander. Eine private Freigabe macht ein Werk nicht öffentlich. Nur fertig importierte Werke sind lesbar; weder eine Freigabe noch die Administratorrolle umgeht diese Voraussetzung.</p><p>Zum Widerrufen entfernst du den Haken beim Konto und speicherst die privaten Freigaben erneut. Bei der nächsten Serverabfrage wird der Zugriff wieder geprüft. Bereits im Browser geladener Text kann dadurch nicht aus dem Gerät entfernt werden. Ein geteiltes Reader-Lesezeichen erteilt dem Empfänger keine zusätzlichen Rechte.</p><p>Gesperrte Konten stehen nicht für neue Freigaben zur Verfügung. Fehlt ein gewünschtes Konto oder meldet das Formular ungültige Konten, prüfe den Nutzerstatus und lade die Ressourcenseite neu.</p>`
			},
			{
				id: 'api-freigabe',
				title: 'Abrufe über die öffentliche API erlauben oder sperren',
				html: `<ol><li>Wähle das Werk unter <a href="/admin/resources">Administration → Ressourcen</a>.</li><li>Prüfe, ob seine Lizenz Abrufe über eine Programmierschnittstelle erlaubt.</li><li>Aktiviere oder deaktiviere <strong>Über die öffentliche API abrufbar</strong>.</li><li>Klicke auf <strong>Änderungen speichern</strong>.</li></ol><p>Die Einstellung gilt für die öffentliche Programmierschnittstelle <code>/api/v1</code>, einschließlich persönlicher API-Schlüssel, Suchen und Wortstudien. Gesperrte Werke erscheinen dort nicht in der Ressourcenliste; direkte Kapitelabrufe liefern keinen Text. Markierungen und Sammlungen behalten ihre Stellenangaben, ohne gesperrten Bibeltext beizufügen.</p><p>Die Lesbarkeit im Reader ist davon unabhängig und wird über <strong>Öffentlich sichtbar</strong> und <strong>Private Freigaben</strong> festgelegt. Eine API-Freigabe macht ein privates Werk nicht öffentlich und ersetzt keine persönliche Freigabe. Neue Ressourcen sind zunächst für die API freigegeben; ein erneuter Inhaltsimport behält die administrativ gewählte Einstellung.</p>`
			},
			{
				id: 'statistiken',
				title: 'Statistiken und Systemübersicht prüfen',
				html: `<p><strong>Statistiken aktualisieren</strong> oben auf der Ressourcenseite berechnet abgeleitete Statistiken und die Suchwortliste neu. Die Aktion bezieht sich auf den Datenbestand, nicht nur auf das gerade ausgewählte Werk.</p><p>Unter <a href="/admin">Administration → Übersicht</a> findest du die Ressourcen nach Art, letzte Importe und den aufklappbaren Bereich <strong>Datenbankdetails</strong>. Dort sind Zeilenzahlen Datenbankschätzungen. Sie sind kein Nachweis dafür, dass jede Stelle eines Werks erfolgreich importiert wurde. Prüfe dafür den Importbericht und Beispielstellen im Reader.</p>`
			},
			{
				id: 'loeschen',
				title: 'Eine Ressource entfernen',
				html: `<p>Das Löschen entfernt den importierten Bestand. Soll ein Werk nur nicht mehr öffentlich angeboten werden, ändere stattdessen seine Sichtbarkeit und Freigaben.</p><ol><li>Wähle die zu entfernende Ressource und öffne <strong>Ressource löschen …</strong>.</li><li>Bei einer Bibel wählst du unter <strong>Kommentare verschieben nach</strong> eine andere öffentliche, fertig importierte Bibel. Ohne passende Zielübersetzung bleibt das Löschen gesperrt.</li><li>Gib den angezeigten Ressourcenbezeichner exakt in das Bestätigungsfeld ein.</li><li>Prüfe Werk und Ziel noch einmal und klicke auf <strong>Endgültig löschen</strong>.</li></ol><p>Die vorhandenen privaten Verskommentare der Bibel werden vor dem Entfernen dem gewählten Ziel zugeordnet. Die Freigaben der entfernten Ressource entfallen. Für eine spätere Wiederaufnahme des Werks benötigst du seine Importquelle oder eine passende Datensicherung.</p>`
			}
		]
	},
	{
		id: 'ressourcen-importieren',
		topic: 'administration',
		path: '/help/administration/ressourcen-importieren',
		title: 'Bibeln und Nachschlagewerke importieren',
		description:
			'Wähle das passende Ressourcenformat, prüfe Bezeichner und Importbericht und kontrolliere das fertige Werk im Reader.',
		icon: 'download',
		audience: 'admin',
		level: 'guide',
		keywords: [
			'Import',
			'Bibel',
			'SWORD',
			'Zefania',
			'OSIS',
			'USFM',
			'USX',
			'USFX',
			'CSV',
			'TSP',
			'Morphologie',
			'Lexikon',
			'Warnung',
			'Fehler'
		],
		prerequisite:
			'Ein Administratorkonto und eine Quelldatei in einem unterstützten Ressourcenformat.',
		sections: [
			{
				id: 'starten',
				title: '1. Den Import vorbereiten und starten',
				html: `<ol><li>Öffne <a href="/admin/import">Administration → Importieren</a> oder <strong>Ressource importieren</strong> in der Ressourcenverwaltung.</li><li>Wähle unter <strong>Datei</strong> die Quelldatei.</li><li>Lasse <strong>Format</strong> zunächst auf „automatisch erkennen“ oder wähle das bekannte Format ausdrücklich.</li><li>Prüfe den Ressourcenbezeichner. Falls du Angaben aus der Datei ersetzen möchtest, klappe <strong>Angaben aus der Datei überschreiben</strong> auf.</li><li>Starte mit <strong>Importieren</strong> und beobachte <strong>Letzte Importe</strong>.</li></ol><aside class="callout"><strong>Ein vorhandener Bezeichner wird wiederverwendet.</strong><p>Ein erneuter Import mit derselben Kennung kann das vorhandene Werk ersetzen. Verwende für eine eigenständige Ausgabe einen eigenen Bezeichner. Wenn du einen bestehenden Bestand ersetzt, halte dessen Quelle beziehungsweise eine aktuelle Sicherung bereit.</p></aside><p>Dieser Import verwaltet Werke für den Reader. Für eigene Markdown-Notizen oder Ausarbeitungen verwendest du den getrennten <a href="/notes/import">Dokumentimport</a>.</p>`,
				screenshot: {
					src: '/help/media/admin-import.webp',
					width: 645,
					height: 267,
					alt: 'Formular für den Ressourcenimport mit Dateiauswahl, automatischer Formaterkennung und eingeklappten Angaben zum Überschreiben.',
					caption:
						'Zuerst die Datei wählen, dann das Format prüfen. Zusätzliche Angaben lassen sich unterhalb der Formatwahl aufklappen.'
				}
			},
			{
				id: 'bibel-formate',
				title: 'Bibeldateien: das passende Format wählen',
				html: `<dl class="definition-list"><div><dt>Zefania XML (Bibel)</dt><dd>XML-Bibeln mit <code>XMLBIBLE</code> als Wurzelelement. Vorhandene Strong- und Grammatikangaben können mitgelesen werden.</dd></div><div><dt>SWORD-Modul (Bibel)</dt><dd>Ein SWORD-Roharchiv als ZIP mit Modulkonfiguration und Moduldaten. Eine ZIP-Datei mit beliebigen Textdateien ist kein SWORD-Modul. Das Serverimage benötigt den SWORD-Leser <code>diatheke</code>.</dd></div><div><dt>OSIS XML (Bibel)</dt><dd>OSIS mit umschlossenen Versen oder den dafür vorgesehenen Anfangs-/Endmarken.</dd></div><div><dt>USFM, USX, USFX</dt><dd>Strukturierte Bibelformate mit Buch-, Kapitel- und Versangaben. Bei USFM werden Wortattribute mit Strong-Nummern berücksichtigt; Fußnoten und Querverweise werden beim Import nicht übernommen.</dd></div><div><dt>Ein Vers pro Zeile / CSV (Bibel)</dt><dd>Stellenangabe und Text je Zeile oder getrennte Spalten für Buch, Kapitel, Vers und Text. Unterstützt werden Tabulator, senkrechter Strich, Semikolon und Komma als Trennzeichen.</dd></div></dl><p>Die automatische Erkennung betrachtet den Inhalt. Die Dateiendung allein entscheidet nicht zuverlässig zwischen verschiedenen XML- oder Textformaten. Bei einer Erkennungsfehlermeldung wählst du das bekannte Format im Auswahlfeld und startest erneut.</p>`
			},
			{
				id: 'nachschlagewerke',
				title: 'Kommentare, Lexika und Parallelstellen',
				html: `<dl class="definition-list"><div><dt>Kommentare</dt><dd>Wähle je nach Quelle Zefania XML (Kommentar), SWORD-Modul (Kommentar), Kommentar (CSV/Markdown) oder Kommentar (ThML). Bei Zeilenformaten werden Bibelstelle und Kommentartext zusammen eingelesen.</dd></div><div><dt>Strong-Lexika</dt><dd>„Strong's Wörterbuch (XML)“ liest passende Strong-Wörterbuchdateien. Für das besondere hebräische Lexikonformat gibt es außerdem die Auswahl <code>hebrew-lexicon-xml</code>.</dd></div><div><dt>Parallelstellen</dt><dd>„Parallelstellen (CSV/TSV)“ erwartet eine Ausgangsstelle und eine Zielstelle je Zeile; eine Gewichtung kann als weitere Spalte angegeben werden.</dd></div><div><dt>Robinson-Grammatik (TSP)</dt><dd>Ergänzt eine vorhandene griechische Grundtextbibel um Wortformen und Lemma-Angaben. Das Feld „Grundtext ergänzen“ erscheint erst bei ausgewähltem TSP-Format.</dd></div></dl><h3>Grammatikdaten ergänzen</h3><ol><li>Importiere zuerst die passende Grundtextbibel.</li><li>Wähle die TSP-Datei und ausdrücklich das Format <strong>Robinson-Grammatik (TSP)</strong>.</li><li>Wähle unter <strong>Grundtext ergänzen</strong> die passende vorhandene Bibel.</li><li>Starte den Import und lies die Hinweise zur Wortzuordnung.</li></ol><p>Unterschiedliche Wortaufteilungen der Quellen können Zuordnungen begrenzen. Ein erfolgreicher Import bedeutet deshalb nicht, dass jedes Wort eine Grammatikangabe erhalten hat.</p>`
			},
			{
				id: 'metadaten',
				title: 'Angaben aus der Datei überschreiben',
				html: `<p>Der aufklappbare Bereich enthält <strong>Bezeichner</strong>, <strong>Sprache</strong>, <strong>Name</strong> und <strong>Spaltentitel</strong>. Trage nur Angaben ein, die du bewusst vorgeben möchtest; nicht ausgefüllte Felder lassen die jeweilige Ermittlung aus der Quelle zu.</p><p>Der Bezeichner ist die dauerhafte Kennung des Werks und wird in Großbuchstaben übernommen. Für Sprachen nennt das Formular beispielsweise <code>de</code>, <code>grc</code> und <code>hbo</code>. Je nach Format stammen weitere Angaben aus der Quelle oder werden vom Importer festgelegt.</p><p>Die sichtbaren Cover-, Tab- und Auswahltitel sowie die Reihenfolge passt du nach dem Import unter <a href="/help/administration/ressourcen-verwalten">Ressourcen</a> an. Diese redaktionellen Darstellungseinstellungen sind von der Textquelle getrennt.</p>`
			},
			{
				id: 'fortschritt',
				title: '2. Fortschritt, Hinweise und Fehler prüfen',
				html: `<ol><li>Beobachte den Eintrag unter <strong>Letzte Importe</strong>. Während „läuft“ zeigt er die bisher verarbeiteten Einträge und gegebenenfalls den aktuellen Abschnitt.</li><li>Warte auf <strong>fertig</strong> oder <strong>fehlgeschlagen</strong>.</li><li>Öffne vorhandene <strong>Hinweise</strong> über die Schaltfläche mit ihrer Anzahl.</li><li>Prüfe bei einem Fehler dessen konkrete Meldung, korrigiere die Quelle oder Formatwahl und starte den Import erneut.</li></ol><p>Die Zustände heißen „wartet“, „läuft“, „fertig“, „fehlgeschlagen“ und gegebenenfalls „abgebrochen“. Importe laufen einzeln. Während eines laufenden Imports zeigt die Schaltfläche „Ein Import läuft …“ und startet keinen weiteren über dieses Formular.</p><p>Hinweise können doppelte Verse, ungültige Strong-Nummern oder unvollständige Grammatikzuordnungen nennen. Bei doppelten Versstellen einer Bibel bleibt der erste nicht leere Text erhalten. Eine Warnung solltest du deshalb am betreffenden Vers prüfen, auch wenn der Gesamtimport fertig geworden ist.</p>`
			},
			{
				id: 'kontrolle',
				title: '3. Das fertige Werk kontrollieren',
				html: `<ol><li>Öffne die Ressource in der <a href="/admin/resources">Ressourcenverwaltung</a> und prüfe Kennung, Sprache, Zählwerte und Sichtbarkeit.</li><li>Kontrolliere im Reader mindestens eine Stelle am Anfang, eine im Inneren und eine am Ende des enthaltenen Bestands.</li><li>Prüfe bei Strong-Werken zusätzlich eine Wortstudie, bei Kommentaren die Zuordnung zu einer Stelle und bei Parallelstellen einen Verweis.</li><li>Lege die gewünschten Titel, Reihenfolge und gegebenenfalls privaten Freigaben fest.</li></ol><p>Nur fertig importierte Ressourcen sind lesbar. Eine private Freigabe macht einen unvollständigen Import nicht verwendbar. Fehlt ein Werk trotz fertigem Import, prüfe deshalb zuerst seine Sichtbarkeit und die Freigabe für das verwendete Konto.</p><p>Bei Bibelimporten werden Text, Metadaten und Wortindizes gemeinsam übernommen. Ein Parserfehler oder eine Quelle ohne verwendbaren Bibeltext ersetzt einen vorhandenen Bibelbestand nicht. Diese Zusage betrifft Bibelimporte; prüfe bei anderen Ressourcenarten den konkreten Fehler und den Zustand des Werks.</p>`
			}
		]
	},
	{
		id: 'nutzer-verwalten',
		topic: 'administration',
		path: '/help/administration/nutzer-verwalten',
		title: 'Nutzerkonten, Rollen und Zugänge verwalten',
		description:
			'Finde Konten, vergib Verwaltungsrechte und unterstütze bei Aktivierung, Passwort und gesperrtem Zugang.',
		icon: 'user',
		audience: 'admin',
		level: 'guide',
		keywords: [
			'Nutzer',
			'Konto',
			'Rolle',
			'Administrator',
			'Verwaltung',
			'Sperren',
			'Aktivieren',
			'Passwort-Link',
			'Aktivierungslink'
		],
		prerequisite: 'Ein angemeldetes Konto mit Administratorrolle.',
		sections: [
			{
				id: 'finden',
				title: '1. Das gewünschte Konto finden',
				html: `<ol><li>Öffne <a href="/admin/users">Administration → Nutzer</a>.</li><li>Gib E-Mail-Adresse oder Anzeigenamen in <strong>Nutzer durchsuchen</strong> ein.</li><li>Nutze bei Bedarf den Statusfilter <strong>Alle Konten</strong>, <strong>Aktiv</strong>, <strong>Verwaltung</strong>, <strong>Nicht aktiviert</strong> oder <strong>Gesperrt</strong>.</li><li>Prüfe die E-Mail-Adresse der gefundenen Zeile, bevor du eine Aktion ausführst.</li></ol><p>Die Tabelle zeigt Anzeigename, Rolle, Anzahl der Listen sowie Registrierung und letzte Anmeldung. „Aktiv“ meint ein bestätigtes, nicht gesperrtes Konto. Ein Konto mit Verwaltungsrolle kann trotzdem gesperrt oder noch nicht aktiviert sein.</p>`,
				screenshot: {
					src: '/help/media/admin-users-search.webp',
					width: 992,
					height: 65,
					alt: 'Such- und Filterleiste der Nutzerverwaltung mit dem Suchwort Beispiel und dem Filter Alle Konten.',
					caption:
						'Suche nach Namen oder E-Mail und grenze die Ansicht bei Bedarf über den Kontostatus ein. Der Ausschnitt enthält keine Nutzerzeilen.'
				}
			},
			{
				id: 'rolle',
				title: '2. Die Rolle ändern',
				html: `<ol><li>Öffne in der betreffenden Zeile die Auswahl unter <strong>Rolle</strong>.</li><li>Wähle <strong>Nutzer</strong> für den normalen Zugang oder <strong>Verwaltung</strong> für den Administrationsbereich.</li><li>Die Auswahl wird unmittelbar gespeichert; es gibt keine zusätzliche Speichern-Schaltfläche.</li></ol><p>Verwaltungsrechte ermöglichen Änderungen an Ressourcen, Konten, Analyse und Backups. Sie erteilen jedoch keine pauschale Lesefreigabe für private Werke oder fremde private Notizen. Die eigene Rolle lässt sich auf dieser Seite nicht ändern; der Versuch meldet „Das eigene Konto kann nicht geändert werden“.</p>`
			},
			{
				id: 'links',
				title: 'Bei Passwort und Kontoaktivierung helfen',
				html: `<h3>Einen Passwort-Link bereitstellen</h3><ol><li>Klicke in der Zeile des richtigen Kontos auf <strong>Passwort-Link</strong>.</li><li>Kopiere den oben angezeigten Einmal-Link.</li><li>Gib ihn nur an die zugehörige Person über einen geeigneten direkten Kanal weiter.</li></ol><p>Der Link gilt eine Stunde. Er wird in der Verwaltungsoberfläche angezeigt und durch diese Aktion nicht automatisch per E-Mail verschickt.</p><h3>Ein noch nicht bestätigtes Konto aktivieren lassen</h3><ol><li>Filtere nach <strong>Nicht aktiviert</strong>.</li><li>Klicke beim richtigen Konto auf <strong>Aktivierungslink</strong>.</li><li>Gib den angezeigten Einmal-Link an die zugehörige Person weiter.</li></ol><p>Der Aktivierungslink ist 24 Stunden gültig. Er bestätigt die E-Mail-Adresse. Die Aktion „aktivieren“ bei einem gesperrten Konto hat eine andere Bedeutung: Sie hebt die Sperre auf.</p><p>Behandle beide Linkarten wie kurzfristige Zugangsdaten. Sie gehören nicht in öffentliche Tickets, Screenshots oder gemeinsam zugängliche Dokumente.</p>`
			},
			{
				id: 'sperren',
				title: 'Einen Zugang sperren und wieder freigeben',
				html: `<ol><li>Prüfe die gewünschte Nutzerzeile.</li><li>Klicke auf <strong>sperren</strong>. Die Aktion wirkt unmittelbar und beendet bestehende Sitzungen dieses Kontos.</li><li>Um die Sperre später aufzuheben, suche das Konto mit dem Filter <strong>Gesperrt</strong> und klicke auf <strong>aktivieren</strong>.</li></ol><p>Während der Sperre sind auch persönliche und öffentliche API-Schlüssel dieses Kontos ungültig. Nach dem Entsperren funktionieren Schlüssel wieder, sofern sie nicht widerrufen wurden. Eine neue Anmeldung kann erforderlich sein.</p><p>Die eigene Kontosperre ist in dieser Verwaltung ausgeschlossen. Sperren löscht das Konto und seine Inhalte nicht. Eine Funktion zum Löschen von Konten wird in dieser Oberfläche nicht angeboten.</p>`
			}
		]
	},
	{
		id: 'umami-einrichten',
		topic: 'administration',
		path: '/help/administration/umami-einrichten',
		title: 'Die freiwillige Umami-Analyse einrichten',
		description:
			'Verbinde eine vorhandene Umami-Instanz und erkläre den Besuchern, wer die zugelassenen Nutzungsdaten verarbeitet.',
		icon: 'info',
		audience: 'admin',
		level: 'guide',
		keywords: [
			'Umami',
			'Analyse',
			'Statistik',
			'Einwilligung',
			'Datenschutz',
			'Website-ID',
			'Tracking'
		],
		prerequisite:
			'Administratorrolle sowie eine vorhandene Umami-Instanz ab Version 2.18 mit eingerichteter Website.',
		sections: [
			{
				id: 'einrichten',
				title: '1. Die Verbindung und Betreiberangaben eintragen',
				html: `<ol><li>Öffne <a href="/admin/analytics">Administration → Umami</a>.</li><li>Übernimm <strong>Skript-Adresse (HTTPS)</strong> und <strong>Website-ID</strong> aus der vorgesehenen Umami-Konfiguration.</li><li>Trage den <strong>Betreiber der Umami-Instanz</strong> und seine <strong>Datenschutzhinweise (HTTPS)</strong> ein.</li><li>Beschreibe unter <strong>Verarbeitung und Speicherfristen beim Betreiber</strong> den tatsächlichen Hosting-Ort, die Aufbewahrung und gegebenenfalls Übermittlungen außerhalb der EU beziehungsweise des EWR.</li><li>Aktiviere <strong>Umami aktivieren</strong> und klicke auf <strong>Analyse-Einstellungen speichern</strong>.</li></ol><p>Bei aktivierter Analyse sind alle Angaben erforderlich. Die Website-ID muss eine gültige UUID sein. HTTPS-Adressen dürfen keine eingebetteten Zugangsdaten und kein Fragment hinter einem Rautenzeichen enthalten.</p>`,
				screenshot: {
					src: '/help/media/admin-analytics.webp',
					width: 672,
					height: 674,
					alt: 'Umami-Einstellungen mit fiktiven HTTPS-Adressen, Website-ID und Angaben zur Verarbeitung.',
					caption:
						'Beispielwerte im echten Formular vor dem Speichern. Für die Einrichtung ersetzt du sie durch die Angaben deiner Umami-Instanz.'
				}
			},
			{
				id: 'einwilligung',
				title: '2. Die Besucherentscheidung überprüfen',
				html: `<ol><li>Öffne Akribos in einem separaten Browserprofil ohne vorhandene Analyseentscheidung.</li><li>Prüfe, dass die freiwillige Analyse erst nach einer Zustimmung geladen wird.</li><li>Prüfe die Betreiberangaben in der <a href="/datenschutz">Datenschutzerklärung</a>.</li><li>Öffne <strong>Freiwillige Nutzungsanalyse</strong> am unteren Seitenrand, um die eigene Analyseentscheidung zu ändern.</li></ol><p>Änderungen an der Konfiguration verlangen eine neue Entscheidung der Besucher. Eine frühere Zustimmung gilt damit nicht automatisch für einen anderen Empfänger oder geänderte Angaben.</p>`
			},
			{
				id: 'umfang',
				title: 'Welche Informationen gezählt werden',
				html: `<p>Akribos übermittelt nur freigegebene allgemeine Seitenbereiche, etwa Reader, Wortstudie oder Hilfe. Konkrete Suchbegriffe, Lesestellen, ausgewählte Ressourcen, Notizinhalte und Dokumentkennungen werden nicht als besuchte Adresse übertragen. Konto- und Verwaltungsseiten werden nicht gezählt.</p><p>Die Texte zu Verarbeitung und Speicherfristen informieren die Besucher. Sie richten keine Löschfristen in Umami ein. Die tatsächliche Aufbewahrung muss beim Betreiber der Umami-Instanz entsprechend konfiguriert sein.</p>`
			},
			{
				id: 'aendern',
				title: 'Analyse ändern, deaktivieren und Fehler prüfen',
				html: `<p>Zum Abschalten entfernst du den Haken bei <strong>Umami aktivieren</strong> und speicherst erneut. Zum Ändern von Skript, Website oder Betreiberangaben bearbeitest du die jeweiligen Felder und wartest auf „Analyse-Einstellungen gespeichert“.</p><p>Bei einer Fehlermeldung prüfe fehlende Pflichtfelder, HTTPS-Adressen und das UUID-Format der Website-ID. Die Einstellungsseite erstellt keine Umami-Instanz und zeigt keine Auswertungen an; Statistiken betrachtest du in der verbundenen Umami-Anwendung.</p>`
			}
		]
	},
	{
		id: 'backups-einrichten',
		topic: 'administration',
		path: '/help/administration/backups-einrichten',
		title: 'Datenbank sichern und automatische Backups einrichten',
		description:
			'Lade ein Sofort-Backup herunter oder richte S3-Sicherungen mit Zeitplan, Aufbewahrung und überprüfbarem Verlauf ein.',
		icon: 'download',
		audience: 'admin',
		level: 'guide',
		keywords: [
			'Backup',
			'Sicherung',
			'S3',
			'Zeitplan',
			'Aufbewahrung',
			'Download',
			'Bucket',
			'Verbindung testen',
			'pg_dump'
		],
		prerequisite:
			'Administratorrolle. Das Serverimage benötigt PostgreSQL-Client-Werkzeuge; für automatische S3-Backups außerdem BACKUP_ENCRYPTION_KEY und S3-Zugangsdaten.',
		sections: [
			{
				id: 'sofort',
				title: '1. Eine Sicherung sofort herunterladen',
				html: `<ol><li>Öffne <a href="/admin/backup">Administration → Backup</a>.</li><li>Gehe zum Abschnitt <strong>Sofort-Backup</strong>.</li><li>Klicke auf <strong>Backup herunterladen</strong>.</li><li>Warte, bis der Download vollständig abgeschlossen ist, und bewahre die Datei an einem geschützten Ort auf.</li></ol><p>Die Datei enthält die gesamte Akribos-Datenbank im PostgreSQL-Custom-Format. Bei einem großen Bestand kann die Erstellung dauern. Dies ist eine Sicherung aller Datenbankinhalte, einschließlich der Nutzerdaten, und kein Export einzelner Notizen.</p><p>Die Sicherung ersetzt keine Kopie der Serverumgebung und ihrer separat gesetzten Geheimnisse. Für eigene Dokumente stehen in der Nutzeroberfläche Markdown-, Word- und PDF-Exporte zur Verfügung.</p>`
			},
			{
				id: 's3',
				title: '2. S3-kompatiblen Speicher verbinden',
				html: `<ol><li>Gehe zu <strong>Automatisches Backup nach S3</strong>.</li><li>Trage <strong>Endpoint (URL)</strong>, <strong>Region</strong>, <strong>Bucket</strong> und den gewünschten <strong>Pfad-Präfix</strong> ein.</li><li>Hinterlege <strong>Access Key ID</strong> und <strong>Secret Access Key</strong> des vorgesehenen Speicherkontos.</li><li>Prüfe <strong>Path-Style-Adressierung verwenden</strong> passend zum Dienst. Das Formular nennt MinIO und viele S3-kompatible Dienste als Anwendungsfälle.</li><li>Klicke auf <strong>Verbindung testen</strong> und lies die Rückmeldung.</li></ol><p>Der Verbindungstest prüft den Bucket und schreibt anschließend eine kleine Testdatei, die er wieder löscht. Ein ausschließlich lesender Zugang reicht deshalb nicht. Der Test speichert die Konfiguration nicht; verwende dafür anschließend <strong>Speichern</strong>.</p><p>Ein bereits gespeicherter Secret Access Key wird nicht wieder angezeigt. Lasse sein Feld leer, wenn er unverändert bleiben soll. Die Einstellung <code>BACKUP_ENCRYPTION_KEY</code> auf dem Server schützt diese gespeicherten Zugangsdaten; sie ist keine Aussage darüber, dass die heruntergeladene Dump-Datei selbst verschlüsselt wäre.</p>`,
				screenshot: {
					src: '/help/media/admin-backup.webp',
					width: 862,
					height: 489,
					alt: 'S3-Backupformular mit fiktiven Verbindungsangaben sowie Feldern für Zeitplan und Aufbewahrung.',
					caption:
						'Fiktive Verbindungsangaben vor dem Speichern; ein Secret wurde nicht eingegeben. Zeitplan und Aufbewahrung stehen im selben Formular.'
				}
			},
			{
				id: 'zeitplan',
				title: '3. Zeitplan und Aufbewahrung festlegen',
				html: `<ol><li>Wähle unter <strong>Häufigkeit</strong> „Stündlich“, „Täglich“ oder „Wöchentlich“.</li><li>Lege stündlich die Minute fest; täglich die Uhrzeit; wöchentlich zusätzlich den Wochentag.</li><li>Trage die passende <strong>Zeitzone</strong> ein, beispielsweise <code>Europe/Berlin</code>.</li><li>Stelle <strong>Aufbewahrung im Bucket</strong> und <strong>Lokale Kopien</strong> ein.</li><li>Setze <strong>Automatische Backups aktiviert</strong> und klicke auf <strong>Speichern</strong>.</li></ol><p>Die Aufbewahrungsfelder zählen Sicherungen, keine Tage. Im Bucket sind 1 bis 365 Sicherungen einstellbar; für lokale Kopien 0 bis 20. Lokale Kopien liegen zusätzlich auf dem Servervolume. Sie sind besonders hilfreich, wenn S3 vorübergehend nicht erreichbar ist, ersetzen aber keinen Speicher außerhalb dieses Servers.</p><p>Unter dem Formular erscheinen der nächste geplante Lauf und, soweit vorhanden, die letzte erfolgreiche Sicherung. Änderungen an ungespeicherten Formularfeldern wirken noch nicht auf den laufenden Zeitplan.</p>`
			},
			{
				id: 'kontrolle',
				title: '4. Eine Sicherung auslösen und kontrollieren',
				html: `<ol><li>Speichere zunächst die vollständige S3-Konfiguration und aktiviere die Automatik.</li><li>Klicke auf <strong>Jetzt sichern</strong>, um mit der gespeicherten Konfiguration einen Lauf zu starten.</li><li>Prüfe im Bereich <strong>Verlauf</strong> den Eintrag „Manuell nach S3“ bis zum Zustand <strong>fertig</strong>.</li><li>Öffne bei Bedarf <strong>Liste im Bucket aktualisieren</strong> und kontrolliere Datum und Größe der Datei.</li></ol><p>„Jetzt sichern“ bleibt bei laufendem Backup- oder Wiederherstellungsvorgang beziehungsweise ausgeschalteter S3-Sicherung gesperrt. Die Speicherung des Formulars und das Auslösen einer Sicherung sind getrennte Aktionen.</p><p>Der Verlauf unterscheidet Downloads, automatische oder manuell ausgelöste S3-Läufe, Sicherungen vor einer Wiederherstellung und Wiederherstellungen. Bei einem fehlgeschlagenen Lauf zeigt er die konkrete Fehlermeldung. Ein gestarteter Lauf ist erst mit „fertig“ als erfolgreich zu bewerten.</p>`
			},
			{
				id: 'dateien',
				title: 'Vorhandene Sicherungen und typische Fehler',
				html: `<p>Lokale Kopien und aufgelistete Bucket-Dateien lassen sich herunterladen. Bei lokalen Dateien gibt es außerdem eine Löschaktion; sie entfernt die ausgewählte lokale Kopie. Der gesonderte Link <strong>direkt wiederherstellen</strong> führt dagegen zur vollständigen Datenbankwiederherstellung und ist keine Vorschau.</p><dl class="definition-list"><div><dt>PostgreSQL-Werkzeuge fehlen</dt><dd>Die Seite meldet fehlendes <code>pg_dump</code>. Das Serverimage muss zuerst die benötigten PostgreSQL-Client-Werkzeuge enthalten.</dd></div><div><dt>Verschlüsselungsschlüssel fehlt</dt><dd>Ohne <code>BACKUP_ENCRYPTION_KEY</code> lassen sich automatische S3-Backups nicht aktivieren. Diese Voraussetzung wird in der Serverumgebung eingerichtet.</dd></div><div><dt>Verbindung fehlgeschlagen</dt><dd>Prüfe Endpoint, Bucket, Region, Adressierungsart und die Rechte zum Lesen, Schreiben sowie Löschen der Testdatei.</dd></div><div><dt>Backup fehlgeschlagen</dt><dd>Lies den Verlauf. Prüfe die gemeldete Ursache; eine alte erfolgreiche Sicherung beweist nicht, dass der letzte Lauf funktioniert hat.</dd></div></dl><p>Der Ablauf zum Zurückspielen ist unter <a href="/help/administration/backup-wiederherstellen">Eine Datenbank aus einem Backup wiederherstellen</a> getrennt beschrieben.</p>`
			}
		]
	},
	{
		id: 'backup-wiederherstellen',
		topic: 'administration',
		path: '/help/administration/backup-wiederherstellen',
		title: 'Eine Datenbank aus einem Backup wiederherstellen',
		description:
			'Wähle eine lokale, hochgeladene oder in S3 gespeicherte Sicherung und prüfe den vollständigen Wiederherstellungsvorgang.',
		icon: 'lock',
		audience: 'admin',
		level: 'guide',
		keywords: [
			'Backup',
			'Wiederherstellen',
			'Restore',
			'Sicherheitskopie',
			'dump',
			'Datenbank',
			'WIEDERHERSTELLEN'
		],
		prerequisite:
			'Administratorrolle, PostgreSQL-Client-Werkzeuge und ein passendes Datenbankbackup im pg_dump-Custom-Format.',
		sections: [
			{
				id: 'auswirkung',
				title: 'Was eine Wiederherstellung ersetzt',
				html: `<p>Eine Wiederherstellung ersetzt den <strong>gesamten Inhalt der Datenbank</strong> durch den gewählten Sicherungsstand. Nutzerdaten, Ressourcen, Listen, Notizen und Datenbankeinstellungen entsprechen danach diesem Stand. Einzelne Dokumente werden dabei nicht mit dem aktuellen Bestand zusammengeführt.</p><p>Akribos erstellt vorher automatisch eine Sicherung des aktuellen Zustands. Schlägt diese Sicherheitskopie fehl, wird die Wiederherstellung nicht ausgeführt. Ein späterer Fehler beim eigentlichen Zurückspielen bedeutet jedoch nicht automatisch, dass der vorherige Zustand vollständig wiederhergestellt wurde.</p><p>Wähle die Sicherung anhand von Datum, Herkunft und gewünschtem Datenstand. Während des Zurückspielens ist die Anwendung zeitweise nicht verlässlich nutzbar; plane den Vorgang entsprechend. Ein hochgeladener Dateiname allein ist noch keine Bestätigung der inhaltlichen Eignung.</p>`
			},
			{
				id: 'hochladen',
				title: '1. Eine Backup-Datei hochladen',
				html: `<ol><li>Öffne <a href="/admin/backup#restore">Administration → Backup → Wiederherstellen</a>.</li><li>Wähle unter <strong>Backup-Datei (.dump)</strong> die gewünschte Sicherung.</li><li>Warte, bis der Upload vollständig abgeschlossen ist und die Datei als hochgeladen angezeigt wird.</li><li>Prüfe eine eventuell angezeigte Fehlermeldung, bevor du fortfährst.</li></ol><p>Der Upload bereitet die Datei zunächst nur vor. Er stellt die Datenbank noch nicht wieder her. Erwartet wird das PostgreSQL-Custom-Format, wie es das Sofort-Backup erstellt; eine SQL-Textdatei oder ein persönlicher Markdown-Export ist dafür nicht geeignet.</p>`,
				screenshot: {
					src: '/help/media/admin-restore.webp',
					width: 638,
					height: 138,
					alt: 'Leere Dateiauswahl für ein Datenbankbackup und gesperrte Schaltfläche Endgültig wiederherstellen.',
					caption:
						'Ohne vorbereitete Datei und passende Bestätigung bleibt der Start gesperrt. Eine Dateiauswahl allein stellt noch nichts wieder her.'
				}
			},
			{
				id: 'bestaetigen',
				title: '2. Die Wiederherstellung bestätigen und starten',
				html: `<ol><li>Klappe <strong>Bestätigung für Wiederherstellung</strong> im oberen Teil der Seite auf.</li><li>Lies die Auswirkung und gib exakt <code>WIEDERHERSTELLEN</code> in das Bestätigungsfeld ein.</li><li>Gehe zur bereits hochgeladenen Datei zurück und prüfe, dass sie die richtige Sicherung ist.</li><li>Klicke auf <strong>Endgültig wiederherstellen</strong>.</li><li>Beobachte im <strong>Verlauf</strong> zuerst die Sicherung vor der Wiederherstellung und danach die eigentliche Wiederherstellung.</li></ol><p>Der Start bleibt gesperrt, solange die Datei nicht bereitsteht, die Bestätigungsphrase nicht passt oder ein anderer Backup-/Wiederherstellungsvorgang läuft. Die Bestätigung gilt für die Wiederherstellungsaktionen auf dieser Seite.</p>`
			},
			{
				id: 'vorhandene-datei',
				title: 'Alternative: vorhandene lokale oder S3-Datei verwenden',
				html: `<ol><li>Suche die Sicherung unter den lokalen Kopien oder lade mit <strong>Liste im Bucket aktualisieren</strong> die vorhandenen S3-Dateien.</li><li>Prüfe Dateiname, Datum und Größe.</li><li>Fülle die <strong>Bestätigung für Wiederherstellung</strong> aus.</li><li>Klicke genau bei der gewählten Datei auf <strong>direkt wiederherstellen</strong>.</li></ol><p>Ein vorheriger Download mit anschließendem erneutem Upload ist dabei nicht nötig. Auch diese Wege ersetzen die gesamte Datenbank und erstellen zuvor die Sicherheitskopie. Für S3 muss die gespeicherte Verbindung verfügbar sein.</p>`
			},
			{
				id: 'nachkontrolle',
				title: '3. Ergebnis und Anwendung prüfen',
				html: `<ol><li>Warte im Verlauf auf <strong>fertig</strong>. Lies auch vorhandene Warnhinweise; bei Bedarf muss der Serverlog geprüft werden.</li><li>Melde dich gegebenenfalls erneut an. Konten und Sitzungen stammen nun aus dem wiederhergestellten Stand.</li><li>Prüfe einige Bibelstellen, eine Suche, eine Wortstudie und bekannte persönliche Daten aus der Sicherung.</li><li>Kontrolliere S3-Konfiguration, Zeitplan und nächste Sicherung erneut, da auch Datenbankeinstellungen zurückgesetzt wurden.</li></ol><p>Akribos gleicht nach dem Zurückspielen das Datenbankschema an die laufende Anwendung an und baut benötigte Such- und Wortstatistiken neu auf. Erst ein abgeschlossener Vorgang und die anschließende Funktionskontrolle bestätigen die nutzbare Wiederherstellung.</p><p>Meldet der Verlauf einen Fehler, lies dessen Ursache und prüfe den tatsächlichen Zustand. Starte nicht mehrere Wiederherstellungen gleichzeitig. Die vorab erzeugte Sicherheitskopie bleibt der Ausgangspunkt, falls der vorherige Datenstand wieder benötigt wird.</p>`
			}
		]
	},
	{
		id: 'notizen-teilen',
		topic: 'administration',
		path: '/help/administration/notizen-teilen',
		title: 'Eine eigene Notiz als Leselink freigeben',
		description:
			'Erstelle einen nicht gelisteten Schnappschuss deiner Notiz, aktualisiere ihn bewusst und ziehe die Freigabe bei Bedarf zurück.',
		icon: 'file-text',
		audience: 'admin',
		level: 'guide',
		keywords: [
			'Notiz',
			'Teilen',
			'Freigabe',
			'Schnappschuss',
			'Veröffentlichen',
			'nicht gelistet',
			'Webadresse',
			'Leselink'
		],
		prerequisite:
			'Ein Administratorkonto, eine eigene Notiz und ein im Profil gesetzter Anzeigename. Ausarbeitungen können nicht über diesen Ablauf freigegeben werden.',
		sections: [
			{
				id: 'freigeben',
				title: '1. Den freizugebenden Stand vorbereiten',
				html: `<ol><li>Öffne deine eigene Notiz in der <a href="/notes">Notizbibliothek</a>.</li><li>Prüfe Titel, Text, Schlagwörter und verknüpfte Bibelstellen. Diese Angaben gehören zum freigegebenen Schnappschuss.</li><li>Prüfe unter <a href="/account">Profil &amp; Sicherheit</a> deinen Anzeigenamen; er wird als Autorenname verwendet.</li><li>Öffne in der Notiz den Bereich <strong>Freigabe per Link</strong>.</li></ol><p>Dieser Ablauf ist für Administratoren auf ihre eigenen Notizen beschränkt. Er macht fremde private Dokumente nicht zugänglich. Für normale Nutzer zeigt der Bereich einen Hinweis auf die benötigte Administratorrolle.</p>`
			},
			{
				id: 'link',
				title: '2. Einen Schnappschuss freigeben',
				html: `<ol><li>Wähle unter <strong>Webadresse</strong> einen verständlichen, eindeutigen Namen für den Link.</li><li>Ergänze bei Bedarf eine <strong>Kurzbeschreibung</strong> mit höchstens 500 Zeichen.</li><li>Klicke auf <strong>Schnappschuss freigeben</strong>.</li><li>Öffne <strong>Freigegebenen Link öffnen</strong> und prüfe die Leseransicht.</li><li>Kopiere erst danach die Adresse für die vorgesehenen Empfänger.</li></ol><aside class="callout"><strong>Nicht gelistet bedeutet: Jeder mit dem Link kann lesen.</strong><p>Die Notiz erscheint in keiner öffentlichen Übersicht und wird nicht zur Suchmaschinenindexierung angeboten. Der Link ist dennoch kein passwortgeschützter Zugang: Empfänger können ihn weitergeben und den Inhalt ohne Anmeldung lesen.</p></aside><p>Die Webadresse wird in eine passende URL-Kennung umgewandelt. Falls sie bereits von einer anderen Freigabe verwendet wird, wähle einen unterscheidbaren Namen. Ohne Anzeigenamen kann keine Freigabe angelegt werden; die Konto-E-Mail wird nicht als Ersatzname veröffentlicht.</p>`,
				screenshot: {
					src: '/help/media/note-sharing.webp',
					width: 320,
					height: 341,
					alt: 'Freigabeformular einer eigenen Admin-Notiz mit Webadresse, Kurzbeschreibung und Schaltfläche Schnappschuss freigeben.',
					caption:
						'Vor der ersten Freigabe prüfst du Webadresse und Kurzbeschreibung. Die Aufnahme zeigt das vorbereitete Formular; es wurde noch kein Schnappschuss freigegeben.'
				}
			},
			{
				id: 'aktualisieren',
				title: '3. Änderungen bewusst übernehmen',
				html: `<ol><li>Bearbeite deine Notiz weiter und warte, bis die Änderungen gespeichert sind.</li><li>Prüfe im Bereich <strong>Freigabe per Link</strong> den Hinweis auf neuere Änderungen der Arbeitskopie.</li><li>Klicke auf <strong>Freigabe aktualisieren</strong>, wenn der neue Stand für Leser erscheinen soll.</li><li>Öffne den freigegebenen Link erneut und kontrolliere das Ergebnis.</li></ol><p>Die Arbeitskopie und der freigegebene Schnappschuss sind getrennt. Gewöhnliches Bearbeiten aktualisiert den Leselink nicht automatisch. Das gilt auch für die mit dem Schnappschuss übernommenen Schlagwörter und Stellenangaben.</p><p>Wenn du die Webadresse beim Aktualisieren änderst, verwende anschließend die neue Adresse. Behalte sie unverändert, wenn bereits weitergegebene Links weiterhin dieselbe Freigabe erreichen sollen.</p>`
			},
			{
				id: 'zurueckziehen',
				title: 'Eine Freigabe zurückziehen',
				html: `<ol><li>Öffne die eigene Notiz und ihren Bereich <strong>Freigabe per Link</strong>.</li><li>Klicke auf <strong>Freigabe zurückziehen</strong>.</li><li>Die freigegebene Fassung ist anschließend nicht mehr über ihren bisherigen Leselink verfügbar.</li></ol><p>Deine Arbeitskopie bleibt erhalten. Bereits gelesene oder kopierte Inhalte werden durch das Zurückziehen nicht von fremden Geräten entfernt. Möchtest du die Notiz in eine Ausarbeitung umwandeln, ziehe ihre vorhandene Freigabe zuerst zurück.</p><p>Das Teilen von Stellensammlungen ist davon unabhängig und steht deren berechtigten Nutzern zur Verfügung. Die Anleitung findest du unter <a href="/help/listen">Stellensammlungen</a>.</p>`
			}
		]
	}
];
