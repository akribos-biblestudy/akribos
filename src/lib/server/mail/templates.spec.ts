import { describe, expect, test } from 'vitest';
import { emailVerificationMail, passwordResetMail, verseListInviteMail } from './templates.ts';

describe('transactional mail templates', () => {
	test('renders a branded account-verification HTML mail with a text fallback', () => {
		const link = 'https://akribos.de/register/verify/test-token';
		const mail = emailVerificationMail(link);

		expect(mail.subject).toBe('Akribos: Bitte bestätige deine E-Mail-Adresse');
		expect(mail.text).toContain(`Konto bestätigen: ${link}`);
		expect(mail.text).toContain('24 Stunden');
		expect(mail.html).toContain('<!doctype html>');
		expect(mail.html).toContain(`href="${link}"`);
		expect(mail.html).toContain('Willkommen bei Akribos');
	});

	test('distinguishes a resent verification message', () => {
		const mail = emailVerificationMail('https://akribos.de/verify/token', { resent: true });

		expect(mail.html).toContain('Neuer Bestätigungslink');
		expect(mail.text).toContain('neu angeforderte');
	});

	test('renders password-reset copy and safely escapes the HTML link', () => {
		const link = 'https://akribos.de/password-reset/token?a=1&b=2';
		const mail = passwordResetMail(link);

		expect(mail.subject).toBe('Akribos: Passwort zurücksetzen');
		expect(mail.text).toContain(`Passwort zurücksetzen: ${link}`);
		expect(mail.text).toContain('eine Stunde');
		expect(mail.html).toContain('https://akribos.de/password-reset/token?a=1&amp;b=2');
		expect(mail.html).not.toContain(`href="${link}"`);
	});

	test('renders a verse-list invite naming the inviter and the list', () => {
		const link = 'https://akribos.de/invites/test-token';
		const mail = verseListInviteMail(link, { listTitle: 'Verheißungen', inviterName: 'Maria' });

		expect(mail.subject).toContain('Maria');
		expect(mail.text).toContain(`Einladung ansehen: ${link}`);
		expect(mail.text).toContain('Verheißungen');
		expect(mail.text).toContain('7 Tage');
		expect(mail.html).toContain('<!doctype html>');
		expect(mail.html).toContain(`href="${link}"`);
		expect(mail.html).toContain('Maria');
		expect(mail.html).toContain('Verheißungen');
	});
});
