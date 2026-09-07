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

`SermonBoard.svelte` uses nested `dndzone` actions with separate types for columns and cards. The
entire card can be dragged, including its title and body; an ordinary title click still opens the
editor. Column titles can be clicked to rename inline (Enter or blur saves, Escape cancels), and
columns can be reordered by dragging their headers. A plus button after the last column opens the
creation field. The header's three-dot menu contains deletion and left/right actions as a keyboard
alternative; deletion retains its explicit destination dialog. There is no separate settings panel.

Card events stop propagation so a nested card move cannot become a column reorder. Reordering sends
the complete ordered list of IDs with the board revision; the repository requires an exact permutation
of the current own columns, rejecting duplicates, omissions and foreign IDs. The extra plus control is
outside the action's element because every direct child of a dndzone must correspond to an item.
Pointer capture excludes header form/menu controls from starting a column drag. Space/Enter on a
focused card or column starts keyboard dragging; Alt+Left/Right on document links remains available.
Touch uses a short hold to distinguish dragging from scrolling. German announcements, an explicit error
message after failed moves, and document/board revisions remain application responsibilities.
