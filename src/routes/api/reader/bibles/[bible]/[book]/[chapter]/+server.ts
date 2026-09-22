import { bibleChapterResponse } from '$lib/server/api/bible-chapter';
import type { RequestHandler } from './$types';

/** Internal quotations and verse previews follow Reader access, independently of API licensing. */
export const GET: RequestHandler = (event) => bibleChapterResponse(event, 'reader');
