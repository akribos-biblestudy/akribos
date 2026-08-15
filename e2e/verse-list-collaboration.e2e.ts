import { expect, test, type Page } from '@playwright/test';
import { lastMailLinkTo } from './lib/mail-outbox.ts';

/**
 * Sharing a verse list with another account by email, and the collaboration that unlocks: adding a
 * verse, threaded comments (with replies) and emoji reactions.
 *
 * Two accounts are needed, so each gets its own browser context — a session is per-context, and the
 * two people involved are never signed in on the same one.
 */

const PASSWORD = 'ein-sicheres-passwort';

function uniqueEmail(name: string): string {
	return `e2e-${name}-${Math.random().toString(36).slice(2, 10)}@example.com`;
}

async function register(page: Page, email: string, displayName: string): Promise<void> {
	await page.goto('/register');
	await page.getByLabel('E-Mail-Adresse').fill(email);
	await page.getByLabel('Anzeigename').fill(displayName);
	await page.getByLabel('Passwort', { exact: true }).fill(PASSWORD);
	await page.getByLabel('Passwort wiederholen').fill(PASSWORD);
	await page.getByRole('button', { name: 'Konto erstellen' }).click();
	await expect(page).toHaveURL(/\/register\/check-email$/);

	await page.goto(await lastMailLinkTo(email));
	await page.getByRole('button', { name: 'Konto aktivieren' }).click();
	await expect(page).toHaveURL(/\/account$/);
}

test('sharing a list by email: adding a verse, replying to a comment, and reacting with an emoji', async ({
	browser
}) => {
	const ownerEmail = uniqueEmail('owner');
	const memberEmail = uniqueEmail('member');

	const ownerContext = await browser.newContext();
	const ownerPage = await ownerContext.newPage();
	await register(ownerPage, ownerEmail, 'Owner');

	// The invited person already has an account, registered first — so that once the invite mail
	// arrives, it is unambiguously the *last* mail sent to their address (their own registration
	// mail, sent moments earlier, would otherwise be mistaken for it by `lastMailLinkTo`).
	const memberContext = await browser.newContext();
	const memberPage = await memberContext.newPage();
	await register(memberPage, memberEmail, 'Member');

	// Create a shared list from the settings dashboard, same as any other list.
	await ownerPage.goto('/account');
	await ownerPage.getByRole('button', { name: 'Verslisten & Kommentare' }).click();
	await ownerPage.getByPlaceholder('Neue Versliste').fill('Gemeinsame Liste');
	await ownerPage.getByRole('button', { name: 'Neue Versliste' }).click();
	await expect(ownerPage).toHaveURL(/\/lists\//);
	const listUrl = ownerPage.url();

	// Invite the second account by email.
	await ownerPage.getByLabel('E-Mail-Adresse einladen').fill(memberEmail);
	await ownerPage.getByRole('button', { name: 'Einladen' }).click();
	await expect(ownerPage.getByText('Einladung verschickt.')).toBeVisible();

	// The member opens the mailed invite link (already signed in from registering above) and accepts.
	await memberPage.goto(await lastMailLinkTo(memberEmail));
	await expect(memberPage.getByText('Gemeinsame Liste')).toBeVisible();
	await memberPage.getByRole('button', { name: 'Einladung annehmen' }).click();
	await expect(memberPage).toHaveURL(listUrl);

	// The member adds a verse of their own.
	await memberPage.getByPlaceholder('Joh 3,16').fill('Joh 3,16');
	await memberPage.getByRole('button', { name: 'Zur Versliste hinzufügen' }).click();
	await expect(memberPage.getByRole('link', { name: 'Johannes 3,16' })).toBeVisible();

	// … and comments on it.
	await memberPage.getByRole('button', { name: 'Kommentar hinzufügen' }).first().click();
	const memberEditor = memberPage.getByRole('textbox', { name: 'Kommentar' });
	await memberEditor.click();
	await memberEditor.fill('Mein Lieblingsvers!');
	await memberPage
		.locator('form[action="?/comment"]')
		.getByRole('button', { name: 'Speichern' })
		.click();
	await expect(memberPage.getByText('Mein Lieblingsvers!')).toBeVisible();
	await expect(memberPage.getByText('Member').first()).toBeVisible();

	// The owner sees the new verse, the member's name on their comment, and replies to it.
	await ownerPage.reload();
	await expect(ownerPage.getByRole('link', { name: 'Johannes 3,16' })).toBeVisible();
	await expect(ownerPage.getByText('Mein Lieblingsvers!')).toBeVisible();
	await expect(ownerPage.getByText('Member').first()).toBeVisible();

	// Scoped to the member's own comment article, not the reply nested inside it a moment later —
	// both are `<article>` elements, one inside the other, each with its own reaction bar.
	const commentItem = ownerPage.locator('article', { hasText: 'Mein Lieblingsvers!' }).first();
	const commentReactions = commentItem.locator(':scope > form.reaction-picker');

	await commentItem.getByRole('button', { name: 'Antworten' }).click();
	const replyEditor = ownerPage.getByRole('textbox', { name: 'Kommentar' });
	await replyEditor.click();
	await replyEditor.fill('Meiner auch!');
	await ownerPage
		.locator('form[action="?/comment"]')
		.getByRole('button', { name: 'Speichern' })
		.click();
	await expect(ownerPage.getByText('Meiner auch!')).toBeVisible();

	// The owner reacts to the member's comment with an emoji from the fixed set of 8.
	await commentReactions.getByRole('button', { name: '❤️' }).click();
	await expect(commentReactions.getByRole('button', { name: '❤️' })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	await expect(commentReactions.getByRole('button', { name: '❤️' })).toContainText('1');

	// The reply and the reaction both survive a reload.
	await ownerPage.reload();
	await expect(ownerPage.getByText('Meiner auch!')).toBeVisible();
	const reloadedReactions = ownerPage
		.locator('article', { hasText: 'Mein Lieblingsvers!' })
		.first()
		.locator(':scope > form.reaction-picker');
	await expect(reloadedReactions.getByRole('button', { name: '❤️' })).toHaveAttribute(
		'aria-pressed',
		'true'
	);

	// The member sees the owner's reply too.
	await memberPage.reload();
	await expect(memberPage.getByText('Meiner auch!')).toBeVisible();

	await ownerContext.close();
	await memberContext.close();
});

test('a member can only remove verses they added themselves; the owner can remove any', async ({
	browser
}) => {
	const ownerEmail = uniqueEmail('owner2');
	const memberEmail = uniqueEmail('member2');

	const ownerContext = await browser.newContext();
	const ownerPage = await ownerContext.newPage();
	await register(ownerPage, ownerEmail, 'Owner2');

	// Registered before the invite is sent, for the same reason as in the previous test: it keeps the
	// invite mail unambiguously the last one sent to this address.
	const memberContext = await browser.newContext();
	const memberPage = await memberContext.newPage();
	await register(memberPage, memberEmail, 'Member2');

	await ownerPage.goto('/account');
	await ownerPage.getByRole('button', { name: 'Verslisten & Kommentare' }).click();
	await ownerPage.getByPlaceholder('Neue Versliste').fill('Zweite gemeinsame Liste');
	await ownerPage.getByRole('button', { name: 'Neue Versliste' }).click();
	await expect(ownerPage).toHaveURL(/\/lists\//);
	const listUrl = ownerPage.url();

	// The owner adds a verse of their own.
	await ownerPage.getByPlaceholder('Joh 3,16').fill('1Mo 1,1');
	await ownerPage.getByRole('button', { name: 'Zur Versliste hinzufügen' }).click();
	await expect(ownerPage.getByRole('link', { name: '1.Mose 1,1' })).toBeVisible();

	await ownerPage.getByLabel('E-Mail-Adresse einladen').fill(memberEmail);
	await ownerPage.getByRole('button', { name: 'Einladen' }).click();
	await expect(ownerPage.getByText('Einladung verschickt.')).toBeVisible();

	await memberPage.goto(await lastMailLinkTo(memberEmail));
	await memberPage.getByRole('button', { name: 'Einladung annehmen' }).click();
	await expect(memberPage).toHaveURL(listUrl);

	// The member adds a second verse …
	await memberPage.getByPlaceholder('Joh 3,16').fill('Joh 3,17');
	await memberPage.getByRole('button', { name: 'Zur Versliste hinzufügen' }).click();
	await expect(memberPage.getByRole('link', { name: 'Johannes 3,17' })).toBeVisible();

	// … and cannot remove the owner's verse: no delete control is even offered for it.
	const ownersVerseItem = memberPage.locator('li', { hasText: '1.Mose 1,1' });
	await expect(
		ownersVerseItem.getByRole('button', { name: 'Aus Versliste entfernen' })
	).toHaveCount(0);

	// But the member's own verse does offer one, and removing it works.
	const membersVerseItem = memberPage.locator('li', { hasText: 'Johannes 3,17' });
	await membersVerseItem.getByRole('button', { name: 'Aus Versliste entfernen' }).click();
	await expect(memberPage.getByRole('link', { name: 'Johannes 3,17' })).toHaveCount(0);

	// The owner, on the other hand, can remove any verse, including their own.
	await ownerPage.reload();
	await ownerPage
		.locator('li', { hasText: '1.Mose 1,1' })
		.getByRole('button', { name: 'Aus Versliste entfernen' })
		.click();
	await expect(ownerPage.getByRole('link', { name: '1.Mose 1,1' })).toHaveCount(0);

	await ownerContext.close();
	await memberContext.close();
});

test('a member can leave a shared list, landing back on their own lists tab', async ({
	browser
}) => {
	const ownerEmail = uniqueEmail('owner3');
	const memberEmail = uniqueEmail('member3');

	const ownerContext = await browser.newContext();
	const ownerPage = await ownerContext.newPage();
	await register(ownerPage, ownerEmail, 'Owner3');

	const memberContext = await browser.newContext();
	const memberPage = await memberContext.newPage();
	await register(memberPage, memberEmail, 'Member3');

	await ownerPage.goto('/account');
	await ownerPage.getByRole('button', { name: 'Verslisten & Kommentare' }).click();
	await ownerPage.getByPlaceholder('Neue Versliste').fill('Dritte gemeinsame Liste');
	await ownerPage.getByRole('button', { name: 'Neue Versliste' }).click();
	await expect(ownerPage).toHaveURL(/\/lists\//);

	await ownerPage.getByLabel('E-Mail-Adresse einladen').fill(memberEmail);
	await ownerPage.getByRole('button', { name: 'Einladen' }).click();
	await expect(ownerPage.getByText('Einladung verschickt.')).toBeVisible();

	await memberPage.goto(await lastMailLinkTo(memberEmail));
	await memberPage.getByRole('button', { name: 'Einladung annehmen' }).click();
	await expect(memberPage).toHaveURL(/\/lists\//);

	// "Liste verlassen" is a <details>/<summary> disclosure: the summary reveals a confirm button of
	// the same name.
	await memberPage.locator('summary', { hasText: 'Liste verlassen' }).click();
	await memberPage.getByRole('button', { name: 'Liste verlassen' }).click();
	// Redirects to the account settings' verse-lists tab, not the old #lists hash (see issue #132).
	await expect(memberPage).toHaveURL(/\/account\?tab=lists$/);
	await expect(memberPage.getByText('Dritte gemeinsame Liste')).toHaveCount(0);

	await ownerContext.close();
	await memberContext.close();
});
