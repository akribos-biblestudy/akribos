# Native App API (Version 1)

Das separate Repository `../akribos-app` enthält den Flutter-Client für Android und iOS.
Die App verwendet die normalen, widerrufbaren Akribos-Sitzungen. Es gibt keinen eingebauten
API-Schlüssel, keine zusätzliche globale Berechtigung und keine Änderung an `resources.api_enabled`.
Leserechte entsprechen den internen Reader-Endpunkten.

## Öffentlicher Zugriff auf akribos.de

Die öffentliche Produktionsbasis der App-API ist **`https://akribos.de/api/app`**. In der Flutter-App
wird als Server **`https://akribos.de`** verwendet. Öffentliche Bibeltexte, verfügbare Werke, Suche und
öffentliche Hilfeseiten funktionieren ohne Registrierung, Sitzungscookie oder API-Schlüssel.
`x-akribos-app: 1` bezeichnet lediglich die Protokollversion und ist kein Geheimnis.

Diese Anfragen benötigen weder `Authorization` noch einen zuvor angelegten Schlüssel:

```sh
curl --fail-with-body --silent --show-error \
  -H 'x-akribos-app: 1' \
  -H 'Origin: https://akribos.de' \
  'https://akribos.de/api/app/bootstrap'

curl --fail-with-body --silent --show-error --get \
  -H 'x-akribos-app: 1' \
  -H 'Origin: https://akribos.de' \
  --data-urlencode 'path=/Joh1' \
  'https://akribos.de/api/app/page'
```

Der Bootstrap liefert `type: "success"`, `data.protocolVersion: 1` und bei Gästen `data.user: null`.
Eine Lesestelle kann zunächst einen kanonischen `redirect`-Umschlag liefern; dessen lokalen
`location`-Wert lädt der Client erneut über `/api/app/page?path=…`.

Persönliche Notizen, Sammlungen, Markierungen und Arbeitsbereiche benötigen die normale
Kontoanmeldung mit Passwort oder E-Mail-Code und den daraus erzeugten Sitzungscookie. Ohne Sitzung
antworten geschützte App-Seiten mit dem lokalen Anmelde-Redirect; geschützte JSON-Endpunkte wie
`/api/documents` liefern HTTP 401. Weder der Versions-/Origin-Header noch ein mitgesendeter API-Key
erteilt Kontorechte. Private Ressourcen bleiben zusätzlich an die aktuellen Kontofreigaben gebunden.
Die getrennte Schnittstelle `/api/v1` und deren API-Key-/Lizenzregeln bleiben unverändert.

| Endpunkt                                         | Aufgabe                                                                                 |
| ------------------------------------------------ | --------------------------------------------------------------------------------------- |
| `GET /api/app/bootstrap`                         | Layout, sichere Sitzungsidentität, Werke, 66 Bücher, Einstellungen und Nutzernavigation |
| `GET /api/app/page?path=/notes`                  | Bestehenden serverseitigen Seitenzustand als JSON laden                                 |
| `POST /api/app/action?path=/notes&action=create` | Eine ausdrücklich freigegebene bestehende Formularaktion ausführen                      |

Alle Anfragen tragen `x-akribos-app: 1`. Native Clients senden den tatsächlichen Server-Origin,
bei Produktion also `Origin: https://akribos.de`, insbesondere für Multipart, damit SvelteKits
bestehender CSRF-Schutz erhalten bleibt. Der Wert enthält keinen Pfad und keinen abschließenden Slash.
Ein nativer HTTPS-Client benötigt keine CORS-Freigabe; fremde Browser-Origins bleiben abgewiesen.
Cookies werden nach Domain/Pfad/Secure/Expiry behandelt; eine fremde Origin darf nie Sitzungscookies
erhalten.
Der Header ist keine Authentifizierung. API-Schlüssel werden nicht in Sitzungskonten umgedeutet.

```json
{ "fields": { "kind": "note", "title": "Meine Notiz", "tagPaths": ["Studium/Johannes"] } }
```

Formularwerte sind Strings oder Stringlisten. Dateiimporte verwenden `multipart/form-data` mit
den ursprünglichen Feldnamen. Die Größenbegrenzungen werden vor der Formularauswertung geprüft.
Private Dokumentimporte prüfen die Sitzung bereits vor dem Einlesen des größeren Anfragekörpers.
Antworten verwenden ein stabiles JSON-Format:

```json
{ "type": "success", "status": 200, "data": {} }
{ "type": "failure", "status": 409, "data": { "error": "conflict" } }
{ "type": "redirect", "status": 303, "location": "/notes/UUID" }
```

Ein Redirect-Umschlag hat HTTP 200; seine ursprüngliche Redirect-Art steht in `status`. Clients
öffnen `location` ausdrücklich und wiederholen niemals den vorigen POST. Fehler behalten den
passenden HTTP-Status. Datumswerte werden als ISO-Zeichenfolgen serialisiert. Erfolgreiche Seiten
enthalten `_path` mit der angefragten kanonischen Route einschließlich Query.

## Gemeinsame Regeln

`src/lib/server/app/routes.ts` ist die geschlossene Liste von Routen und Aktionsnamen. Der Adapter
übernimmt ursprüngliche URL, Parameter, Route und Formularfelder; er erfindet keine zweite Fassung
der Geschäftsregeln. Neue Serveraktionen brauchen eine bewusste Ergänzung des Protokolls und der
nativen Oberfläche. Änderungen an gelieferten Feldern müssen mit dem Client abgestimmt werden.
Verwaltung, Ressourcenimport und reine Adminaktionen sind ausgeschlossen, auch wenn das
angemeldete Konto Administrator ist. Die Hilfe verwendet die normale Nutzerzielgruppe. Bestehende
Eigentums- und Mitgliedschaftsprüfungen gelten weiterhin, auch für Administratoren.

Die App hält einen zufälligen `x-reader-browser-tab` pro laufender App-Instanz. Vor dem ersten
Bootstrap setzt sie `reader-browser-enabled=1` und die passende Klasse `reader-initial-columns`.
Workspace-Mutationen benötigen weiterhin Auswahl- und Inhaltsversionen; Dokumentänderungen die
positive aktuelle `revision`. Der Client serialisiert Speichern, erhält Konfliktentwürfe und wartet
vor Navigation auf ausstehende Änderungen. Ein GET konsumiert keinen Anmelde- oder Einladungstoken.

Für die Code-Anmeldung wird nur der native Challenge-Cookie umbenannt: `app-email-login`, HttpOnly,
Pfad `/api/app`. Die bestehende Anmeldelogik sieht ihn als `email-login`. Webanmeldung und native
Anmeldung beeinflussen ihre Challenge-Cookies nicht gegenseitig. Der Sitzungscookie bleibt derselbe.

Jede Protokollantwort setzt `private, no-store`, `Vary: Cookie` und `noindex, nofollow`. Es gibt kein
offenes CORS, keinen frei wählbaren Upstream und keine Umgehung der öffentlichen API-Lizenzgrenze.

## Bestehende JSON- und Binärschnittstellen

Kapitel, Suche, Strong, Workspace-Verwaltung/-View/-Follow und Dokument-Autosave verwenden weiterhin
`/api/reader/*`, `/api/strong/*` und `/api/documents/*`. Datei-Exporte und Anhänge behalten ihre
bisherigen Adressen. Backupverwaltung und
Ressourcenimport bleiben ausschließlich Funktionen der Webverwaltung.

## Prüfung und Betrieb

`src/lib/server/app/adapter.spec.ts` prüft Allowlist, Origins, Adminschutz, Cookie-Übersetzung,
Antworten und Formulargrenzen. `e2e/app-api.e2e.ts` prüft gegen eine eigene Datenbank echte
Anmeldung, Rollen, private Dokumente, Erstellen, Speichern, Konflikte, Multipart und Abmeldung.
Zusätzlich gelten die vorhandenen Authentifizierungs- und Ressourcenberechtigungstests.

Die neuen Endpunkte müssen mit dem regulären Backend-Image bereitgestellt sein, bevor die App den
Produktionsserver verwenden kann. Es sind keine zusätzliche Datenbankmigration, kein neuer Dienst,
kein API-Key und keine CORS-Ausnahme erforderlich. Die bestehende Produktionskonfiguration muss
`ORIGIN=https://akribos.de` an den Node-Adapter übergeben; die Proxy-Konfiguration muss diesen
öffentlichen Ursprung erhalten. So stimmen native Origin-Header, Secure-Cookies und der vorhandene
CSRF-Schutz überein.

Nach dem Deployment prüft das erste obige `curl`-Beispiel den öffentlichen Protokolleinstieg. Es muss
direkt HTTP 200 mit dem beschriebenen JSON liefern. Ein HTTP-Redirect nach `/search?q=api…` bedeutet,
dass noch ein älterer Server ohne App-Routen antwortet. Die allgemeine Bereitschaftsprüfung bleibt
`GET /healthz`; `/api/ready` ist kein Akribos-Endpunkt. Konto-/Schreibtests ergänzen diesen Gastzugriff.
Gerätesignierung und verifizierte HTTPS-App-Links benötigen unabhängig vom Backend die tatsächlichen
Android-/Apple-Signieridentitäten.
