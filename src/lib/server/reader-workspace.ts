/** Server persistence and legacy projection for the reader workspace. */

import { Buffer } from 'node:buffer';
import type { Cookies } from '@sveltejs/kit';
import {
	allResourceIds,
	normalizeReaderWorkspace,
	type ReaderWorkspace
} from '$lib/reader/workspace';
import { resolveColumns, writeColumns } from './columns.ts';
import type { ReadableResource } from './repositories/resources.ts';

export const READER_WORKSPACE_COOKIE = 'reader-workspace';

const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;
// Leave headroom for cookie attributes and framework encoding below the common 4096-byte limit.
const MAX_COOKIE_VALUE_LENGTH = 3_700;

type CompactWorkspace = [
	1,
	ReaderWorkspace['layout'],
	Array<
		[
			string,
			string | null,
			Array<
				[
					string,
					string,
					Exclude<ReaderWorkspace['tiles'][number]['tabs'][number]['linkSet'], null> | 0
				]
			>
		]
	>,
	Array<[ReaderWorkspace['layout'], number[], number[]]>
];

/**
 * Account state is authoritative for signed-in users and therefore follows them to other devices.
 * Guests use the same compact cookie that is also kept as a sign-out fallback for members.
 */
export function resolveReaderWorkspace(
	cookies: Cookies,
	available: ReadableResource[],
	accountWorkspace: ReaderWorkspace | null | undefined,
	accountColumns: readonly string[] = []
): ReaderWorkspace {
	const fallback = resolveColumns(cookies, available, accountColumns);
	const stored = accountWorkspace ?? readReaderWorkspaceCookie(cookies);
	return normalizeReaderWorkspace(
		stored,
		available.map((resource) => resource.id),
		fallback
	);
}

export function readReaderWorkspaceCookie(cookies: Cookies): unknown {
	const value = cookies.get(READER_WORKSPACE_COOKIE);
	if (!value) return null;
	try {
		const compact = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as unknown;
		return expandWorkspace(compact);
	} catch {
		return null;
	}
}

/** Returns false only when a guest workspace can no longer fit safely in one browser cookie. */
export function writeReaderWorkspace(cookies: Cookies, workspace: ReaderWorkspace): boolean {
	const value = encodeWorkspace(workspace);
	if (value.length > MAX_COOKIE_VALUE_LENGTH) return false;
	cookies.set(READER_WORKSPACE_COOKIE, value, {
		path: '/',
		maxAge: COOKIE_MAX_AGE_SECONDS,
		httpOnly: false,
		sameSite: 'lax'
	});
	return true;
}

/**
 * Keeps older pages and clients useful: the first occurrence of every open resource, capped by the
 * old five-column storage contract. This projection never controls the new workspace after migration.
 */
export function workspaceColumns(workspace: ReaderWorkspace): string[] {
	return [...new Set(allResourceIds(workspace))].slice(0, 5);
}

export function writeWorkspaceCompatibilityCookies(
	cookies: Cookies,
	workspace: ReaderWorkspace
): boolean {
	writeColumns(cookies, workspaceColumns(workspace));
	return writeReaderWorkspace(cookies, workspace);
}

function encodeWorkspace(workspace: ReaderWorkspace): string {
	const compact: CompactWorkspace = [
		1,
		workspace.layout,
		workspace.tiles.map((tile) => [
			tile.id,
			tile.activeTabId,
			tile.tabs.map((tab) => [tab.id, tab.resourceId, tab.linkSet ?? 0])
		]),
		Object.entries(workspace.layoutSizes).flatMap(([layout, size]) =>
			size ? [[layout as ReaderWorkspace['layout'], size.columns, size.rows]] : []
		)
	];
	return Buffer.from(JSON.stringify(compact), 'utf8').toString('base64url');
}

function expandWorkspace(value: unknown): unknown {
	if (!Array.isArray(value) || value[0] !== 1) return null;
	const [, layout, rawTiles, rawSizes] = value;
	return {
		version: 1,
		layout,
		tiles: Array.isArray(rawTiles)
			? rawTiles.map((rawTile) => {
					const tile = Array.isArray(rawTile) ? rawTile : [];
					return {
						id: tile[0],
						activeTabId: tile[1],
						tabs: Array.isArray(tile[2])
							? tile[2].map((rawTab) => {
									const tab = Array.isArray(rawTab) ? rawTab : [];
									return {
										id: tab[0],
										resourceId: tab[1],
										linkSet: tab[2] === 0 ? null : tab[2]
									};
								})
							: []
					};
				})
			: [],
		layoutSizes: Object.fromEntries(
			Array.isArray(rawSizes)
				? rawSizes.flatMap((rawSize) =>
						Array.isArray(rawSize) ? [[rawSize[0], { columns: rawSize[1], rows: rawSize[2] }]] : []
					)
				: []
		)
	};
}
