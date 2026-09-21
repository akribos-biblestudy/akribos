import { existingArticles } from './articles/existing';
import { readerGuides } from './articles/reader-guides';
import { documentGuides } from './articles/document-guides';
import { specialistGuides } from './articles/specialist-guides';
import { workspaceArticle } from './articles/workspace';
import type { HelpArticle } from './types';
import { canReadHelp, type HelpViewer } from '$lib/server/help/access';

export const helpArticles: HelpArticle[] = [
	workspaceArticle,
	...readerGuides,
	...documentGuides,
	...specialistGuides,
	...existingArticles,
	{
		id: 'api',
		topic: 'api',
		path: '/help/api',
		title: 'API & Integrationen',
		description:
			'API-Schlüssel erstellen, Zugriffsrechte wählen und Daten mit eigener Software abrufen.',
		icon: 'code',
		audience: 'api',
		level: 'overview',
		keywords: ['API', 'Schlüssel', 'Token', 'Integration', 'Programmieren'],
		sections: [
			{
				id: 'schluessel',
				title: 'Einen API-Schlüssel erstellen',
				html: `<p>Die API verbindet Akribos mit eigener Software. Zum Lesen und Schreiben im Browser benötigst du keinen Schlüssel. Die Anleitung oben führt dich von der Schlüsselerstellung bis zur ersten Anfrage.</p><ol><li>Öffne <a href="/account">Mein Konto → Profil &amp; Sicherheit</a>.</li><li>Erstelle einen benannten API-Schlüssel mit passendem Zugriff.</li><li>Kopiere den vollständigen Schlüssel bei der Erstellung und verwende ihn in deiner Anwendung.</li></ol>`
			},
			{
				id: 'zugriff',
				title: 'Öffentlicher und persönlicher Zugriff',
				html: `<dl class="definition-list"><div><dt>Nur öffentliche Inhalte</dt><dd>Liest öffentliche Daten. Persönliche Freigaben deines Kontos werden nicht übernommen.</dd></div><div><dt>Auch persönliche Daten</dt><dd>Kann unterstützte persönliche Inhalte sowie dir freigegebene Werke lesen. Behandle den Schlüssel wie ein Passwort.</dd></div></dl><p>Ein Schlüssel unterstützt nur die von der API bereitgestellten Funktionen. Endpunkte, Parameter und Beispiele findest du in der <a href="/api/docs">technischen API-Referenz</a>.</p>`
			}
		]
	},
	{
		id: 'administration',
		topic: 'administration',
		path: '/help/administration',
		title: 'Administration',
		description:
			'Werke importieren und freigeben, Konten betreuen sowie Analyse und Backups verwalten.',
		icon: 'lock',
		audience: 'admin',
		level: 'overview',
		keywords: ['Admin', 'Administrator', 'Verwaltung', 'Ressourcen', 'Nutzer', 'Backup'],
		prerequisite:
			'Ein Konto mit Administratorrolle. Ein normales Nutzerkonto hat keinen Verwaltungszugriff.',
		sections: [
			{
				id: 'zugang',
				title: 'Die Verwaltung öffnen',
				html: `<ol><li>Melde dich mit einem Konto mit Administratorrolle an.</li><li>Öffne im Konto-Menü <strong>Verwaltung</strong>.</li><li>Wähle den Bereich, in dem du arbeiten möchtest.</li></ol><p>Für persönliche Notizen, Arbeitsbereiche und Stellensammlungen genügt ein normales Konto. Eine individuelle Lesefreigabe für ein privates Werk erteilt keine Verwaltungsrechte.</p>`
			},
			{
				id: 'bereiche',
				title: 'Bereiche der Administration',
				html: `<p><strong>Ressourcen</strong> betreut die verfügbaren Werke und deren Freigaben; <strong>Importieren</strong> liest neue Bibeln und Nachschlagewerke ein. <strong>Nutzer</strong> verwaltet Rollen und Zugänge. <strong>Umami</strong> enthält Einstellungen zur freiwilligen Analyse. Unter <strong>Backup</strong> richtest du Sicherungen ein und stellst Daten bei Bedarf wieder her.</p><p>Die Anleitungen oben trennen die einzelnen Aufgaben. Für den persönlichen Import eigener Word- oder Markdown-Dokumente gehe zur <a href="/help/import-export">Nutzerhilfe für Import &amp; Export</a>.</p>`
			}
		]
	}
];

/** Overview articles double as the topic landing page; task guides live beneath their topic. */
export const helpTopics = helpArticles.filter((article) => article.id === article.topic);

export function getHelpArticles(user: HelpViewer = null): HelpArticle[] {
	return helpArticles.filter((article) => canReadHelp(article, user));
}

export function getHelpTopics(user: HelpViewer = null): HelpArticle[] {
	return helpTopics.filter((article) => canReadHelp(article, user));
}

export function getHelpArticle(path: string, user: HelpViewer = null): HelpArticle | undefined {
	return helpArticles.find((article) => article.path === path && canReadHelp(article, user));
}

export function getHelpGuides(topic: string, user: HelpViewer = null): HelpArticle[] {
	return getHelpArticles(user).filter(
		(article) => article.topic === topic && article.level === 'guide'
	);
}

export function getHelpHeadings(article: HelpArticle) {
	return (
		article.headings ??
		article.sections.map(({ id, title }) => ({ id, title: title ?? 'Anleitung' }))
	);
}
