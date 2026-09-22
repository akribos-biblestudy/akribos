import { bookName } from './book-names.ts';
import { bookById } from './books.ts';

// Display-only titles: reference parsing and canonical URLs retain their German aliases.
const ENGLISH = [
	'Genesis',
	'Exodus',
	'Leviticus',
	'Numbers',
	'Deuteronomy',
	'Joshua',
	'Judges',
	'Ruth',
	'1 Samuel',
	'2 Samuel',
	'1 Kings',
	'2 Kings',
	'1 Chronicles',
	'2 Chronicles',
	'Ezra',
	'Nehemiah',
	'Esther',
	'Job',
	'Psalms',
	'Proverbs',
	'Ecclesiastes',
	'Song of Solomon',
	'Isaiah',
	'Jeremiah',
	'Lamentations',
	'Ezekiel',
	'Daniel',
	'Hosea',
	'Joel',
	'Amos',
	'Obadiah',
	'Jonah',
	'Micah',
	'Nahum',
	'Habakkuk',
	'Zephaniah',
	'Haggai',
	'Zechariah',
	'Malachi',
	'Matthew',
	'Mark',
	'Luke',
	'John',
	'Acts',
	'Romans',
	'1 Corinthians',
	'2 Corinthians',
	'Galatians',
	'Ephesians',
	'Philippians',
	'Colossians',
	'1 Thessalonians',
	'2 Thessalonians',
	'1 Timothy',
	'2 Timothy',
	'Titus',
	'Philemon',
	'Hebrews',
	'James',
	'1 Peter',
	'2 Peter',
	'1 John',
	'2 John',
	'3 John',
	'Jude',
	'Revelation'
] as const;

// Traditional Greek NT titles; cf. https://ebible.org/grcmt/ (public domain).
const GREEK_NT = [
	'Κατὰ Ματθαῖον',
	'Κατὰ Μᾶρκον',
	'Κατὰ Λουκᾶν',
	'Κατὰ Ἰωάννην',
	'Πράξεις',
	'Πρὸς Ῥωμαίους',
	'Πρὸς Κορινθίους Αʹ',
	'Πρὸς Κορινθίους Βʹ',
	'Πρὸς Γαλάτας',
	'Πρὸς Ἐφεσίους',
	'Πρὸς Φιλιππησίους',
	'Πρὸς Κολοσσαεῖς',
	'Πρὸς Θεσσαλονικεῖς Αʹ',
	'Πρὸς Θεσσαλονικεῖς Βʹ',
	'Πρὸς Τιμόθεον Αʹ',
	'Πρὸς Τιμόθεον Βʹ',
	'Πρὸς Τίτον',
	'Πρὸς Φιλήμονα',
	'Πρὸς Ἑβραίους',
	'Ἰακώβου',
	'Πέτρου Αʹ',
	'Πέτρου Βʹ',
	'Ἰωάννου Αʹ',
	'Ἰωάννου Βʹ',
	'Ἰωάννου Γʹ',
	'Ἰούδα',
	'Ἀποκάλυψις'
] as const;

// Hebrew Tanakh titles in Akribos' canonical order, not the Jewish book ordering.
// Spellings: https://www.sefaria.org/texts/Tanakh
const HEBREW_OT = [
	'בראשית',
	'שמות',
	'ויקרא',
	'במדבר',
	'דברים',
	'יהושע',
	'שופטים',
	'רות',
	'שמואל א',
	'שמואל ב',
	'מלכים א',
	'מלכים ב',
	'דברי הימים א',
	'דברי הימים ב',
	'עזרא',
	'נחמיה',
	'אסתר',
	'איוב',
	'תהילים',
	'משלי',
	'קהלת',
	'שיר השירים',
	'ישעיהו',
	'ירמיהו',
	'איכה',
	'יחזקאל',
	'דניאל',
	'הושע',
	'יואל',
	'עמוס',
	'עובדיה',
	'יונה',
	'מיכה',
	'נחום',
	'חבקוק',
	'צפניה',
	'חגי',
	'זכריה',
	'מלאכי'
] as const;

export type BookTitle = { text: string; language: string; direction: 'ltr' | 'rtl' };

/** A resource-language title, with an explicitly language-neutral OSIS fallback. */
export function bookTitle(bookId: number, language: string): BookTitle {
	const base = language.trim().toLowerCase().split(/[-_]/)[0] ?? '';
	const english = ENGLISH[bookId - 1];
	const greek = GREEK_NT[bookId - 40];
	const hebrew = HEBREW_OT[bookId - 1];
	if (['de', 'deu', 'ger'].includes(base)) {
		return { text: bookName(bookId).replace(/^(\d)\./, '$1. '), language: 'de', direction: 'ltr' };
	}
	if (['en', 'eng'].includes(base) && english) {
		return { text: english, language: 'en', direction: 'ltr' };
	}
	if (['grc', 'el', 'ell', 'gre'].includes(base) && greek) {
		return { text: greek, language: 'grc', direction: 'ltr' };
	}
	if (['hbo', 'he', 'heb'].includes(base) && hebrew) {
		return { text: hebrew, language: 'he', direction: 'rtl' };
	}
	return { text: bookById(bookId)?.osisId ?? String(bookId), language: 'und', direction: 'ltr' };
}
