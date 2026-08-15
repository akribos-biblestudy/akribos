/**
 * The fixed set of emoji reactions a verse-list comment can carry — the same 8 GitHub offers on an
 * issue comment. Kept here, outside `src/lib/server/`, so both the schema (which needs it as a
 * literal tuple for the column's TypeScript enum) and the Svelte reaction bar (which needs it to
 * render the picker) import the same one, without pulling server code into the client bundle.
 */
export const COMMENT_REACTION_EMOJIS = ['👍', '👎', '😄', '🎉', '😕', '❤️', '🚀', '👀'] as const;

export type CommentReactionEmoji = (typeof COMMENT_REACTION_EMOJIS)[number];
