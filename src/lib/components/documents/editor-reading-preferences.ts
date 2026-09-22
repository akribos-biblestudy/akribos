/** Preserve resolved reading preferences when the existing editor moves outside its layout into Zen. */
export function copyEditorReadingPreferences(source: HTMLElement, target: HTMLElement): void {
	const style = getComputedStyle(source);
	for (const property of [
		'--reader-font-scale',
		'--reader-text-size',
		'--reader-prose-size',
		'--reader-hebrew-size',
		'--reader-line-height',
		'--reader-font-family'
	]) {
		const value = style.getPropertyValue(property);
		if (value) target.style.setProperty(property, value);
	}
}
