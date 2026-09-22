import type { ClientInit } from '@sveltejs/kit';
import { initializeReaderBrowserTab } from '$lib/reader/browser-tab';

export const init: ClientInit = initializeReaderBrowserTab;
