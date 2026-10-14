import { parseReference } from '$lib/bible/reference';
import type { RequestEvent } from '@sveltejs/kit';

/** A deliberately closed first-party contract; newly added web actions are not exposed implicitly. */
export type AppPageEvent = RequestEvent & {
	parent: () => Promise<Record<string, unknown>>;
	depends: (...dependencies: string[]) => void;
	untrack: <T>(fn: () => T) => T;
};
export type AppPageModule = {
	load?: (event: AppPageEvent) => unknown;
	actions?: Record<string, (event: RequestEvent) => unknown>;
};
type Route = {
	id: NonNullable<RequestEvent['route']['id']>;
	pattern: RegExp;
	names?: string[];
	actions?: readonly string[];
	module: () => Promise<unknown>;
};

const routes: Route[] = [
	{ id: '/', pattern: /^\/$/, module: () => import('../../../routes/+page.server') },
	{
		id: '/login',
		pattern: /^\/login$/,
		actions: ['start', 'code', 'login', 'resend'],
		module: () => import('../../../routes/login/+page.server')
	},
	{
		id: '/login/verify/[token]',
		pattern: /^\/login\/verify\/([A-Za-z0-9_-]+)$/,
		names: ['token'],
		actions: ['default'],
		module: () => import('../../../routes/login/verify/[token]/+page.server')
	},
	{
		id: '/logout',
		pattern: /^\/logout$/,
		actions: ['default'],
		module: () => import('../../../routes/logout/+page.server')
	},
	{
		id: '/register',
		pattern: /^\/register$/,
		module: () => import('../../../routes/register/+page.server')
	},
	{
		id: '/register/check-email',
		pattern: /^\/register\/check-email$/,
		module: () => import('../../../routes/register/check-email/+page.server')
	},
	{
		id: '/register/verify/[token]',
		pattern: /^\/register\/verify\/([A-Za-z0-9_-]+)$/,
		names: ['token'],
		actions: ['default'],
		module: () => import('../../../routes/register/verify/[token]/+page.server')
	},
	{
		id: '/password-reset',
		pattern: /^\/password-reset$/,
		actions: ['default'],
		module: () => import('../../../routes/password-reset/+page.server')
	},
	{
		id: '/password-reset/[token]',
		pattern: /^\/password-reset\/([A-Za-z0-9_-]+)$/,
		names: ['token'],
		actions: ['default'],
		module: () => import('../../../routes/password-reset/[token]/+page.server')
	},
	{
		id: '/account',
		pattern: /^\/account$/,
		actions: [
			'defaultBible',
			'profile',
			'reader',
			'password',
			'createApiKey',
			'revokeApiKey',
			'renameHighlightStyle',
			'addHighlightStyle'
		],
		module: () => import('../../../routes/account/+page.server')
	},
	{
		id: '/account/highlights/[style]',
		pattern: /^\/account\/highlights\/([A-Za-z0-9_-]+)$/,
		names: ['style'],
		module: () => import('../../../routes/account/highlights/[style]/+page.server')
	},
	{
		id: '/notes',
		pattern: /^\/notes$/,
		actions: ['create', 'softDelete', 'restore'],
		module: () => import('../../../routes/notes/+page.server')
	},
	{
		id: '/notes/import',
		pattern: /^\/notes\/import$/,
		actions: ['preview', 'confirm'],
		module: () => import('../../../routes/notes/import/+page.server')
	},
	{
		id: '/notes/published/[slug]',
		pattern: /^\/notes\/published\/([A-Za-z0-9_-]+)$/,
		names: ['slug'],
		module: () => import('../../../routes/notes/published/[slug]/+page.server')
	},
	{
		id: '/notes/[id]',
		pattern: /^\/notes\/([0-9a-f-]{36})$/i,
		names: ['id'],
		actions: [
			'collection',
			'changeKind',
			'syncTags',
			'addPassage',
			'removePassage',
			'addDelivery',
			'removeDelivery'
		],
		module: () => import('../../../routes/notes/[id]/+page.server')
	},
	{
		id: '/sermons',
		pattern: /^\/sermons$/,
		actions: ['columns', 'create', 'move'],
		module: () => import('../../../routes/sermons/+page.server')
	},
	{
		id: '/sermons/templates',
		pattern: /^\/sermons\/templates$/,
		actions: ['create', 'update', 'delete'],
		module: () => import('../../../routes/sermons/templates/+page.server')
	},
	{
		id: '/lists',
		pattern: /^\/lists$/,
		actions: ['createList'],
		module: () => import('../../../routes/lists/+page.server')
	},
	{
		id: '/lists/[id]',
		pattern: /^\/lists\/([0-9a-f-]{36})$/i,
		names: ['id'],
		actions: [
			'rename',
			'addVerse',
			'removeVerse',
			'share',
			'delete',
			'inviteMember',
			'removeMember',
			'revokeInvite',
			'leaveList',
			'comment',
			'deleteComment',
			'react'
		],
		module: () => import('../../../routes/lists/[id]/+page.server')
	},
	{
		id: '/l/[slug]',
		pattern: /^\/l\/([A-Za-z0-9_-]+)$/,
		names: ['slug'],
		module: () => import('../../../routes/l/[slug]/+page.server')
	},
	{
		id: '/invites/[token]',
		pattern: /^\/invites\/([A-Za-z0-9_-]+)$/,
		names: ['token'],
		actions: ['default'],
		module: () => import('../../../routes/invites/[token]/+page.server')
	},
	{
		id: '/workspaces/[id]',
		pattern: /^\/workspaces\/([0-9a-f-]{36})$/i,
		names: ['id'],
		actions: ['default'],
		module: () => import('../../../routes/workspaces/[id]/+page.server')
	},
	{
		id: '/search',
		pattern: /^\/search$/,
		module: () => import('../../../routes/search/+page.server')
	},
	{ id: '/help', pattern: /^\/help$/, module: () => import('../../../routes/help/+page.server') },
	{
		id: '/help/[topic]',
		pattern: /^\/help\/([a-z0-9-]+)$/,
		names: ['topic'],
		module: () => import('../../../routes/help/[topic]/+page.server')
	},
	{
		id: '/help/[topic]/[article]',
		pattern: /^\/help\/([a-z0-9-]+)\/([a-z0-9-]+)$/,
		names: ['topic', 'article'],
		module: () => import('../../../routes/help/[topic]/[article]/+page.server')
	},
	{
		id: '/[strong=strong]/[[page]]',
		pattern: /^\/([GHgh]\d{1,5})(?:\/(\d+))?$/,
		names: ['strong', 'page'],
		module: () => import('../../../routes/[strong=strong]/[[page]]/+page.server')
	}
];

const readerRoute: Route = {
	id: '/[...reference]',
	pattern: /^\/(.+)$/,
	names: ['reference'],
	actions: [
		'setLayout',
		'addTab',
		'replaceTabResource',
		'activateTab',
		'closeTab',
		'moveTab',
		'setTabLinkSet',
		'openBibleReference',
		'setTabReference',
		'setTabLookup',
		'openLexiconTab',
		'setLayoutSize',
		'saveVerseComment',
		'adjustFontSize',
		'addToList',
		'removeFromList',
		'setHighlight',
		'removeHighlight'
	],
	module: () => import('../../../routes/[...reference]/+page.server')
};

export type ResolvedAppRoute = {
	id: NonNullable<RequestEvent['route']['id']>;
	url: URL;
	params: Record<string, string>;
	actions: readonly string[];
	module: () => Promise<AppPageModule>;
};

/** Reject URLs before normalisation can turn an unsafe input into a permitted route. */
export function resolveAppRoute(path: string | null, origin: string): ResolvedAppRoute | null {
	if (
		!path ||
		path.length > 65536 ||
		!path.startsWith('/') ||
		path.startsWith('//') ||
		path.includes('\\') ||
		path.includes('#') ||
		hasControlCharacter(path)
	)
		return null;
	let url: URL;
	let pathname: string;
	try {
		url = new URL(path, origin);
		pathname = decodeURIComponent(url.pathname);
	} catch {
		return null;
	}
	if (
		url.origin !== origin ||
		pathname.includes('\\') ||
		hasControlCharacter(pathname) ||
		pathname.split('/').some((part) => part === '.' || part === '..')
	)
		return null;
	// No encoded path separators or normalised traversal aliases.
	if (/%2f|%5c|(?:^|\/)\.{1,2}(?:\/|\?|$)|%2e/i.test(path.split('?')[0]!)) return null;
	if (pathname === '/help/administration' || pathname.startsWith('/help/administration/'))
		return null;
	const route =
		routes.find((candidate) => candidate.pattern.test(pathname)) ??
		(parseReference(pathname.slice(1)) ? readerRoute : null);
	if (!route) return null;
	const match = route.pattern.exec(pathname);
	if (!match) return null;
	const params: Record<string, string> = {};
	for (const [index, name] of (route.names ?? []).entries()) {
		if (match[index + 1] !== undefined) params[name] = match[index + 1]!;
	}
	return {
		id: route.id,
		url,
		params,
		actions: route.actions ?? [],
		module: async () => (await route.module()) as AppPageModule
	};
}

function hasControlCharacter(value: string): boolean {
	return [...value].some(
		(character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127
	);
}
