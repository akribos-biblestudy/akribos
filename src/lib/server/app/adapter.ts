import {
	error,
	isActionFailure,
	isHttpError,
	isRedirect,
	json,
	type Cookies,
	type RequestEvent
} from '@sveltejs/kit';
import { allBookNames } from '$lib/bible/book-names';
import { bookById } from '$lib/bible/books';
import { requireDocumentUser } from '$lib/server/documents/application';
import {
	MAX_OBSIDIAN_ARCHIVE_BYTES,
	MAX_OBSIDIAN_DECOMPRESSED_BYTES
} from '$lib/notes/obsidian-archive';
import {
	InvalidFormBodyError,
	readBoundedFormData,
	RequestBodyTooLargeError
} from '$lib/server/http/bounded-form-data';
import { resolveAppRoute, type AppPageEvent, type ResolvedAppRoute } from './routes';
import { isLocalReaderRequest } from './reader-mode';

export const APP_PROTOCOL_VERSION = 1;
export const APP_EMAIL_LOGIN_COOKIE = 'app-email-login';
const JSON_LIMIT = 2 * 1024 * 1024;
const MULTIPART_OVERHEAD = 64 * 1024;

type Dependencies = {
	resolveRoute: typeof resolveAppRoute;
	loadLayout: (event: AppPageEvent) => Promise<Record<string, unknown>>;
};
const defaults: Dependencies = {
	resolveRoute: resolveAppRoute,
	loadLayout: async (event) => {
		const module = await import('../../../routes/+layout.server');
		return module.load(event as Parameters<typeof module.load>[0]);
	}
};

/** The explicit header prevents a cross-site HTML form from reaching the action adapter. */
export function assertAppRequest(event: Pick<RequestEvent, 'request' | 'url'>): void {
	const { request, url } = event;
	if (request.headers.get('x-akribos-app') !== String(APP_PROTOCOL_VERSION))
		error(400, 'Nicht unterstützte App-Protokollversion.');
	const origin = request.headers.get('origin');
	if (
		(origin !== null && origin !== url.origin) ||
		request.headers.get('sec-fetch-site') === 'cross-site'
	)
		error(403, 'Ungültiger Ursprung.');
}

/** Keep native email challenges separate, HttpOnly, and scoped to their actual request path. */
export function appCookies(cookies: Cookies): Cookies {
	const nameFor = (name: string) => (name === 'email-login' ? APP_EMAIL_LOGIN_COOKIE : name);
	const optionsFor = <T extends { path: string }>(name: string, options: T): T =>
		name === 'email-login' ? { ...options, path: '/api/app' } : options;
	return {
		get: (name, options) => cookies.get(nameFor(name), options),
		getAll: (options) =>
			cookies
				.getAll(options)
				.filter(({ name }) => name !== 'email-login')
				.map((entry) => ({
					...entry,
					name: entry.name === APP_EMAIL_LOGIN_COOKIE ? 'email-login' : entry.name
				})),
		set: (name, value, options) => cookies.set(nameFor(name), value, optionsFor(name, options)),
		delete: (name, options) => cookies.delete(nameFor(name), optionsFor(name, options)),
		serialize: (name, value, options) =>
			cookies.serialize(nameFor(name), value, optionsFor(name, options))
	};
}

function response(
	type: 'success' | 'failure' | 'redirect',
	status: number,
	payload: Record<string, unknown>
) {
	return json(
		{ type, status, ...payload },
		{
			status: type === 'redirect' ? 200 : status,
			headers: {
				'cache-control': 'private, no-store',
				vary: 'Cookie',
				'x-robots-tag': 'noindex, nofollow',
				'x-akribos-app-version': String(APP_PROTOCOL_VERSION)
			}
		}
	);
}

function redirectResponse(location: string, status: number, origin: string): Response {
	const target = new URL(location, origin);
	if (target.origin !== origin || target.username || target.password || /[\\\r\n]/.test(location))
		return response('failure', 500, { data: { error: 'unsafeRedirect' } });
	return response('redirect', status, {
		location: `${target.pathname}${target.search}${target.hash}`
	});
}

async function run(event: RequestEvent, callback: () => Promise<Response>): Promise<Response> {
	try {
		assertAppRequest(event);
		return await callback();
	} catch (caught) {
		if (isRedirect(caught))
			return redirectResponse(caught.location, caught.status, event.url.origin);
		if (isHttpError(caught))
			return response('failure', caught.status, {
				data: { error: 'requestFailed', ...caught.body }
			});
		if (caught instanceof RequestBodyTooLargeError)
			return response('failure', 413, { data: { error: 'requestTooLarge' } });
		if (caught instanceof InvalidFormBodyError)
			return response('failure', 400, { data: { error: 'invalidForm' } });
		throw caught;
	}
}

function resolve(event: RequestEvent, deps: Dependencies): ResolvedAppRoute {
	const route = deps.resolveRoute(event.url.searchParams.get('path'), event.url.origin);
	if (!route) error(404, 'Diese App-Seite existiert nicht.');
	if (isLocalReaderRequest(event.request) && route.id.startsWith('/workspaces'))
		error(404, 'Arbeitsbereiche stehen im lokalen Reader-Modus nicht zur Verfügung.');
	return route;
}

function pageEvent(
	event: RequestEvent,
	route: ResolvedAppRoute,
	request: Request,
	parent: AppPageEvent['parent']
): AppPageEvent {
	const localReader = isLocalReaderRequest(event.request);
	return {
		...event,
		locals: localReader
			? { ...event.locals, localReader: true, readerWorkspaceContext: undefined }
			: event.locals,
		request,
		url: route.url,
		params: route.params,
		route: { id: route.id },
		cookies: appCookies(event.cookies),
		parent,
		depends: () => undefined,
		untrack: (fn) => fn(),
		// Every app payload is private. A public page's cache headers cannot weaken this invariant.
		setHeaders: () => undefined
	};
}

function requestLimit(route: ResolvedAppRoute, action: string): number {
	if (route.id === '/notes/import')
		return (
			(action === 'confirm' ? MAX_OBSIDIAN_DECOMPRESSED_BYTES * 4 : MAX_OBSIDIAN_ARCHIVE_BYTES) +
			MULTIPART_OVERHEAD
		);
	return JSON_LIMIT;
}

async function boundedJson(request: Request, maximumBytes: number): Promise<unknown> {
	if (Number(request.headers.get('content-length')) > maximumBytes)
		throw new RequestBodyTooLargeError();
	const reader = request.body?.getReader();
	if (!reader) error(400, 'JSON erforderlich.');
	const chunks: Uint8Array[] = [];
	let length = 0;
	try {
		while (true) {
			const { value, done } = await reader.read();
			if (done) break;
			length += value.byteLength;
			if (length > maximumBytes) {
				await reader.cancel();
				throw new RequestBodyTooLargeError();
			}
			chunks.push(value);
		}
	} finally {
		reader.releaseLock();
	}
	const bytes = new Uint8Array(length);
	let offset = 0;
	for (const chunk of chunks) {
		bytes.set(chunk, offset);
		offset += chunk.byteLength;
	}
	try {
		return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
	} catch {
		error(400, 'Ungültiges JSON.');
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function actionRequest(
	event: RequestEvent,
	route: ResolvedAppRoute,
	action: string
): Promise<Request> {
	const contentType = event.request.headers
		.get('content-type')
		?.split(';')[0]
		?.trim()
		.toLowerCase();
	let form: FormData;
	if (contentType === 'application/json') {
		const input = await boundedJson(event.request, requestLimit(route, action));
		if (!isRecord(input) || !isRecord(input.fields))
			error(400, 'Das Feld fields muss ein Objekt sein.');
		form = new FormData();
		for (const [name, value] of Object.entries(input.fields)) {
			const values = Array.isArray(value) ? value : [value];
			for (const field of values) {
				if (typeof field !== 'string') error(400, 'Formularwerte müssen Zeichenfolgen sein.');
				form.append(name, field);
			}
		}
	} else if (contentType === 'multipart/form-data') {
		form = await readBoundedFormData(event.request, requestLimit(route, action));
	} else error(415, 'JSON oder multipart/form-data erforderlich.');
	const headers = new Headers(event.request.headers);
	headers.delete('content-type');
	headers.delete('content-length');
	headers.set('accept', 'application/json');
	return new Request(route.url, { method: 'POST', headers, body: form });
}

export async function appPage(
	event: RequestEvent,
	deps: Dependencies = defaults
): Promise<Response> {
	return run(event, async () => {
		const route = resolve(event, deps);
		const request = new Request(route.url, { headers: event.request.headers });
		let layout: Record<string, unknown> = {};
		const source = pageEvent(event, route, request, async () => layout);
		layout = await deps.loadLayout(source);
		// Native help exposes the ordinary-reader audience, even for an administrator's session.
		if (route.url.pathname.startsWith('/help') && source.locals.user?.role === 'admin') {
			source.locals = { ...source.locals, user: { ...source.locals.user, role: 'user' } };
		}
		const module = await route.module();
		const data = await module.load?.(source);
		return response('success', 200, {
			data: {
				...layout,
				...(isRecord(data) ? data : {}),
				_path: `${route.url.pathname}${route.url.search}`
			}
		});
	});
}

export async function appAction(
	event: RequestEvent,
	deps: Dependencies = defaults
): Promise<Response> {
	return run(event, async () => {
		const route = resolve(event, deps);
		const action = event.url.searchParams.get('action');
		if (!action || !route.actions.includes(action)) error(404, 'Diese App-Aktion existiert nicht.');
		// Match the source import actions: reject guests before allocating the larger upload body.
		if (route.id === '/notes/import') requireDocumentUser(event.locals.user, route.url);
		const module = await route.module();
		if (!module.actions || !Object.hasOwn(module.actions, action))
			error(404, 'Diese App-Aktion existiert nicht.');
		const request = await actionRequest(event, route, action);
		const result = await module.actions[action]!(
			pageEvent(event, route, request, async () => ({}))
		);
		if (isActionFailure(result)) return response('failure', result.status, { data: result.data });
		return response('success', 200, { data: result ?? {} });
	});
}

export async function appBootstrap(
	event: RequestEvent,
	deps: Dependencies = defaults
): Promise<Response> {
	return run(event, async () => {
		const route = deps.resolveRoute('/', event.url.origin)!;
		const source = pageEvent(
			event,
			route,
			new Request(route.url, { headers: event.request.headers }),
			async () => ({})
		);
		const layout = await deps.loadLayout(source);
		const books = allBookNames().map(({ book, names }) => ({
			id: book,
			name: names.name,
			shortName: names.short,
			osisId: bookById(book)?.osisId,
			chapters: bookById(book)?.chapters,
			testament: bookById(book)?.testament
		}));
		const navigation = [
			{ id: 'reader', label: 'Bibel', path: '/' },
			{ id: 'search', label: 'Suche', path: '/search' },
			{ id: 'notes', label: 'Notizen', path: '/notes' },
			{ id: 'sermons', label: 'Ausarbeitungen', path: '/sermons' },
			{ id: 'lists', label: 'Stellensammlungen', path: '/lists' },
			{ id: 'account', label: 'Konto', path: '/account' },
			{ id: 'help', label: 'Hilfe', path: '/help' }
		];
		return response('success', 200, {
			data: { ...layout, protocolVersion: APP_PROTOCOL_VERSION, books, navigation }
		});
	});
}
