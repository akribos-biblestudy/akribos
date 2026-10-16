import type { ClientInit } from '@sveltejs/kit';
import { initializeReaderBrowserTab } from '$lib/reader/browser-tab';
import { isAppEditorPath } from '$lib/app/editor-route';

export const init: ClientInit = () => {
	if (!isAppEditorPath(location.pathname)) return initializeReaderBrowserTab();
};
