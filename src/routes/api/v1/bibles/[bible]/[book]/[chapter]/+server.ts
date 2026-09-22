import { bibleChapterResponse } from '$lib/server/api/bible-chapter';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = (event) => bibleChapterResponse(event, 'api');
