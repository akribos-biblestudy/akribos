type TransactionalMail = {
	subject: string;
	text: string;
	html: string;
};

type TemplateContent = {
	preheader: string;
	eyebrow: string;
	title: string;
	intro: string;
	buttonLabel: string;
	link: string;
	expires: string;
	ignoreNote: string;
};

const colors = {
	ink: '#17231d',
	green: '#1f543b',
	lime: '#b9db84',
	cream: '#f4f0e7',
	muted: '#68746c',
	white: '#ffffff'
} as const;

function escapeHtml(value: string): string {
	return value.replace(
		/[&<>"']/g,
		(character) =>
			({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ??
			character
	);
}

function renderHtml(content: TemplateContent): string {
	const link = escapeHtml(content.link);

	return `<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <title>${escapeHtml(content.title)}</title>
</head>
<body style="margin:0; padding:0; background:${colors.cream}; color:${colors.ink}; font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
  <div style="display:none; max-height:0; overflow:hidden; opacity:0; color:transparent;">${escapeHtml(content.preheader)}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%; background:${colors.cream};">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%; max-width:600px;">
          <tr>
            <td style="padding:0 8px 22px; color:${colors.green}; font-size:22px; font-weight:700; letter-spacing:-0.5px;">
              <span style="display:inline-block; width:28px; height:28px; margin-right:9px; border-radius:7px; background:${colors.green}; color:${colors.lime}; font-family:Georgia,serif; font-size:20px; line-height:28px; text-align:center; vertical-align:-2px;">A</span>Akribos
            </td>
          </tr>
          <tr>
            <td style="overflow:hidden; border-radius:16px; background:${colors.white}; box-shadow:0 12px 40px rgba(23,35,29,0.08);">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td style="height:7px; background:${colors.lime}; font-size:0; line-height:0;">&nbsp;</td>
                </tr>
                <tr>
                  <td style="padding:44px 48px 22px;">
                    <p style="margin:0 0 16px; color:${colors.green}; font-size:12px; font-weight:700; letter-spacing:1.5px; text-transform:uppercase;">${escapeHtml(content.eyebrow)}</p>
                    <h1 style="margin:0; color:${colors.ink}; font-family:Georgia,'Times New Roman',serif; font-size:36px; font-weight:400; line-height:1.12; letter-spacing:-1px;">${escapeHtml(content.title)}</h1>
                  </td>
                </tr>
                <tr>
                  <td style="padding:0 48px 34px;">
                    <p style="margin:0 0 28px; color:${colors.muted}; font-size:16px; line-height:1.7;">${escapeHtml(content.intro)}</p>
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                      <tr>
                        <td style="border-radius:7px; background:${colors.green};">
                          <a href="${link}" style="display:inline-block; padding:15px 24px; color:${colors.white}; font-size:15px; font-weight:700; line-height:1; text-decoration:none;">${escapeHtml(content.buttonLabel)}&nbsp;&nbsp;→</a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="padding:25px 48px; border-top:1px solid #e8e5dc; background:#fbfaf6;">
                    <p style="margin:0 0 8px; color:${colors.ink}; font-size:13px; font-weight:700; line-height:1.5;">${escapeHtml(content.expires)}</p>
                    <p style="margin:0; color:${colors.muted}; font-size:13px; line-height:1.6;">${escapeHtml(content.ignoreNote)}</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:22px 8px 0; color:${colors.muted}; font-size:12px; line-height:1.6;">
              Falls der Button nicht funktioniert, kopiere diesen Link in deinen Browser:<br>
              <a href="${link}" style="color:${colors.green}; text-decoration:underline; word-break:break-all;">${link}</a>
            </td>
          </tr>
          <tr>
            <td style="padding:22px 8px 0; color:${colors.muted}; font-size:11px;">Akribos · Bibelstudium mit Tiefe</td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function renderText(content: TemplateContent): string {
	return [
		'AKRIBOS',
		'',
		content.title,
		'',
		content.intro,
		'',
		`${content.buttonLabel}: ${content.link}`,
		'',
		content.expires,
		content.ignoreNote,
		'',
		'Akribos · Bibelstudium mit Tiefe'
	].join('\n');
}

function transactionalMail(subject: string, content: TemplateContent): TransactionalMail {
	return { subject, text: renderText(content), html: renderHtml(content) };
}

export function emailVerificationMail(
	link: string,
	options: { resent?: boolean } = {}
): TransactionalMail {
	const resent = options.resent ?? false;
	return transactionalMail('Akribos: Bitte bestätige deine E-Mail-Adresse', {
		preheader: 'Ein Klick fehlt noch, dann ist dein Akribos-Konto startklar.',
		eyebrow: resent ? 'Neuer Bestätigungslink' : 'Willkommen bei Akribos',
		title: 'Bestätige deine E-Mail-Adresse',
		intro: resent
			? 'Hier ist der neu angeforderte Link, mit dem du dein Akribos-Konto aktivieren kannst.'
			: 'Schön, dass du da bist. Bestätige jetzt deine E-Mail-Adresse und starte direkt mit deinem persönlichen Bibelstudium.',
		buttonLabel: 'Konto bestätigen',
		link,
		expires: 'Dieser Link ist 24 Stunden gültig und kann nur einmal verwendet werden.',
		ignoreNote: resent
			? 'Du hast keinen neuen Link angefordert? Dann kannst du diese E-Mail einfach ignorieren.'
			: 'Du hast dieses Konto nicht angelegt? Dann kannst du diese E-Mail einfach ignorieren.'
	});
}

export function verseListInviteMail(
	link: string,
	options: { listTitle: string; inviterName: string }
): TransactionalMail {
	return transactionalMail(`Akribos: ${options.inviterName} lädt dich zu einer Versliste ein`, {
		preheader: `${options.inviterName} möchte gemeinsam mit dir an "${options.listTitle}" arbeiten.`,
		eyebrow: 'Einladung zur Zusammenarbeit',
		title: 'Du wurdest zu einer Versliste eingeladen',
		intro: `${options.inviterName} lädt dich ein, gemeinsam an der Versliste „${options.listTitle}“ zu arbeiten. Du kannst dort Verse ergänzen, Kommentare schreiben und auf die Kommentare anderer antworten.`,
		buttonLabel: 'Einladung ansehen',
		link,
		expires: 'Dieser Link ist 7 Tage gültig und kann nur einmal verwendet werden.',
		ignoreNote:
			'Du kennst diese Versliste nicht? Dann kannst du diese E-Mail einfach ignorieren – es ändert sich nichts an deinem Konto.'
	});
}

export function passwordResetMail(link: string): TransactionalMail {
	return transactionalMail('Akribos: Passwort zurücksetzen', {
		preheader: 'Mit diesem sicheren Link kannst du ein neues Passwort vergeben.',
		eyebrow: 'Kontosicherheit',
		title: 'Vergib ein neues Passwort',
		intro:
			'Du möchtest dein Passwort für Akribos zurücksetzen. Über den folgenden Link kannst du jetzt ein neues vergeben.',
		buttonLabel: 'Passwort zurücksetzen',
		link,
		expires: 'Dieser Link ist eine Stunde gültig und kann nur einmal verwendet werden.',
		ignoreNote:
			'Du hast das Zurücksetzen nicht angefordert? Dann ignoriere diese E-Mail – dein bisheriges Passwort bleibt unverändert.'
	});
}
