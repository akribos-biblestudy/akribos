import { appAction } from '$lib/server/app/adapter';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = (event) => appAction(event);
