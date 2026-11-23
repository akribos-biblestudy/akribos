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
		anchors: {
			schluessel: 'api-schluessel-verwenden--erstellen',
			zugriff: 'api-schluessel-verwenden--zugriff'
		},
		sections: []
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
				html: `<p><strong>Ressourcen</strong> betreut die verfügbaren Werke und deren Freigaben; <strong>Importieren</strong> liest neue Bibeln und Nachschlagewerke ein. <strong>Nutzer</strong> verwaltet Rollen und Zugänge. <strong>Umami</strong> enthält Einstellungen zur freiwilligen Analyse. Unter <strong>Backup</strong> richtest du Sicherungen ein und stellst Daten bei Bedarf wieder her.</p><p>Für den persönlichen Import eigener Word- oder Markdown-Dokumente gehe zur <a href="/help/import-export">Nutzerhilfe für Import &amp; Export</a>.</p>`
			}
		]
	}
];

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
