import { readFile } from 'node:fs/promises';
import { MAIL_TEST_OUTBOX } from '../../scripts/lib/mail-outbox.ts';

type SentMail = { to: string; subject: string; text: string };

/**
 * Recovers the link from the most recent mail the app "sent" to `email`.
 *
 * Registration and password reset only ever store a token's hash, and e2e runs without a
 * `BREVO_API_KEY`, so the app's `loggingMailer` never delivers anything — see the doc comment on
 * `MAIL_TEST_OUTBOX` for why this file exists at all. Reads are polled briefly: the write is awaited
 * server-side before the response is sent, but the two processes can still race by a beat.
 */
export async function lastMailLinkTo(email: string): Promise<string> {
	for (let attempt = 0; attempt < 30; attempt++) {
		const link = await findLink(email);
		if (link) return link;
		await new Promise((resolve) => setTimeout(resolve, 100));
	}
	throw new Error(`no mail to ${email} appeared in the e2e outbox in time`);
}

export async function lastMailCodeTo(email: string): Promise<string> {
	const content = await readFile(MAIL_TEST_OUTBOX, 'utf8');
	for (const line of content.trim().split('\n').reverse()) {
		const mail = JSON.parse(line) as SentMail;
		if (mail.to === email) {
			const code = mail.text.match(/Dein Anmeldecode: (\d{6})/);
			if (code) return code[1]!;
		}
	}
	throw new Error(`No sign-in code for ${email}`);
}

async function findLink(email: string): Promise<string | null> {
	let content: string;
	try {
		content = await readFile(MAIL_TEST_OUTBOX, 'utf8');
	} catch {
		return null;
	}

	const lines = content.split('\n').filter((line) => line.length > 0);
	for (let i = lines.length - 1; i >= 0; i--) {
		const mail = JSON.parse(lines[i]) as SentMail;
		if (mail.to !== email) continue;
		const match = mail.text.match(/https?:\/\/\S+/);
		if (match) return match[0];
	}
	return null;
}
