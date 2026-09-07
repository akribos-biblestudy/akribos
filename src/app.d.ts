// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
import type { User } from '$lib/server/db/schema';
import type { ApiAuth } from '$lib/server/api/gate';

declare global {
	namespace App {
		interface PageState {
			readerState?: string;
			readerNotesFilters?: import('$lib/reader/url-state').ReaderNotesFilters;
		}

		interface Error {
			message: string;
			/**
			 * A Strong's number to try instead, when the requested one does not exist. The old error page
			 * made the same offer: ask for H430 and get pointed at G430.
			 */
			alternative?: string;
		}

		interface Locals {
			/** Set by the auth hook when the request carries a valid session cookie. */
			user: Pick<
				User,
				| 'id'
				| 'email'
				| 'displayName'
				| 'role'
				| 'readerColumns'
				| 'readerWorkspace'
				| 'readerFontScale'
				| 'defaultBibleId'
				| 'theme'
				| 'tourCompletedAt'
			> | null;
			/** Session id, needed to renew or revoke the session. */
			sessionId: string | null;
			/** Set by the hook for any `/api/v1` request; null outside that namespace. */
			apiAuth: ApiAuth | null;
		}
	}
}

export {};
