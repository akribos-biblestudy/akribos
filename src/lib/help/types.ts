export type HelpAudience = 'user' | 'api' | 'admin';

export interface HelpScreenshot {
	src: string;
	alt: string;
	caption: string;
	width: number;
	height: number;
	portrait?: boolean;
}

export interface HelpSection {
	id: string;
	title?: string;
	/** Trusted, repository-authored HTML only. Never interpolate requests or imported content. */
	html: string;
	screenshot?: HelpScreenshot;
}

export interface HelpArticle {
	id: string;
	topic: string;
	path: string;
	title: string;
	description: string;
	icon:
		| 'book-open'
		| 'map-pin'
		| 'layout'
		| 'book'
		| 'search'
		| 'highlight'
		| 'list'
		| 'user'
		| 'maximize'
		| 'file-text'
		| 'calendar'
		| 'download'
		| 'info'
		| 'code'
		| 'lock';
	audience: HelpAudience;
	keywords: string[];
	level: 'guide' | 'overview';
	prerequisite?: string;
	headings?: { id: string; title: string }[];
	sections: HelpSection[];
}
