import { appPage } from '$lib/server/app/adapter';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = (event) => appPage(event);
