export interface TutorialVideo {
	title: string;
	duration: string;
}

export const tutorialVideos: Partial<Record<number, TutorialVideo>> = {
	1: { title: 'Akribos kennenlernen', duration: '1:00' },
	2: { title: 'Wo finde ich was in Akribos?', duration: '0:41' },
	3: { title: 'Tabs miteinander verknüpfen', duration: '0:43' },
	4: { title: 'Wörter und Formulierungen suchen', duration: '0:56' },
	5: { title: 'Strong-Suche auf Griechisch und Hebräisch', duration: '1:01' },
	6: { title: 'Arbeitsbereiche und Layouts einrichten', duration: '1:22' },
	7: { title: 'Verse markieren und kopieren', duration: '1:05' },
	8: { title: 'Bibelstellen zu einem Thema sammeln', duration: '0:55' },
	9: { title: 'Notizen mit dem Bibeltext verknüpfen', duration: '1:17' },
	10: { title: 'Ausarbeitungen auf dem Board organisieren', duration: '0:43' },
	11: { title: 'Eine Ausarbeitung für den Einsatz vorbereiten', duration: '0:47' },
	12: { title: 'Notizen und Ausarbeitungen weitergeben', duration: '0:56' },
	13: { title: 'Notizen importieren und exportieren', duration: '1:37' },
	14: { title: 'Die Bibelausgaben in Akribos', duration: '1:24' },
	15: { title: 'Feedback an Akribos geben', duration: '0:43' }
};
