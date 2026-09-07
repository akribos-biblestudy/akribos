# Personal preparation board (issue #167)

Each account owns an ordered list of columns in `users.sermon_columns`, with a separate positive
`sermon_board_revision`. The generated migration supplies the previous five columns to existing and
new accounts. Their legacy IDs stay stable; added columns use UUIDs. Names are editable, unique within
the account ignoring case, and limited to 80 characters. The board allows 1–30 columns.

Board configuration and document status writes serialize on the owner's user row, before any document
row lock. Reconfiguration requires the current board revision; card moves require the current document
revision. Every requested status must belong to that account. Removing a column requires an explicit
remaining target and atomically moves all its documents, including trash and dormant note metadata,
incrementing each affected document revision. GETs never initialize or modify configuration.

The first column is the creation default. The editor and URL `status` filter use the same configuration.
The card list keeps its date ordering even after a drag. Empty boards still display all columns.
Markdown exports add `sermon.statusName` alongside the stable status. Imports resolve an existing own
ID or column name, or create a new own column in the same transaction as the imported document. Foreign
IDs alone never authorize document movement or configuration changes.

## Library evaluation, 2026-09-07

The issue requested evaluating existing Svelte or headless board libraries before implementation.
Primary documentation reviewed:

| Candidate                                                                                                      | Fit and decision                                                                                                                                                                                                                                             |
| -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [svelte-dnd-action](https://github.com/isaacHagoel/svelte-dnd-action)                                          | Headless Svelte actions, Svelte 5 event support, multiple drop zones, drag handles, mouse/touch/keyboard and customizable screen-reader announcements. Selected (`0.9.79` in the lockfile). It leaves rendering, persistence and authorization with Akribos. |
| [SVAR Svelte Kanban](https://docs.svar.dev/svelte/kanban/getting-started/quick-start/)                         | Complete Svelte board accepting columns and cards. A larger replacement for the existing card content, document links, filters and design than this workflow requires.                                                                                       |
| [Atlassian Pragmatic drag and drop](https://atlassian.design/components/pragmatic-drag-and-drop/core-package/) | Framework-independent adapters provide a viable foundation. More Svelte integration and accessibility wiring would remain in this application than with the selected actions.                                                                                |

`SermonBoard.svelte` replaces native drag handlers with the selected library. Cards have a dedicated
handle so document links and text selection remain usable. Space/Enter picks up a handle and Tab moves
between columns; Alt+Left/Right on the document link remains a direct alternative. German announcements,
an explicit error message after failed moves, and the existing document revisions remain application
responsibilities. Column configuration uses normal progressively enhanced forms, including explicit
left/right buttons for ordering and an explicit target for deletion.
