# Kanban Board

## The Idea

Work on this platform moves through a shared Kanban board — a visual workspace where every task is a card and every card lives in a lane. The lane a card sits in *is* its status. No separate fields to keep in sync, no status dropdowns — move the card, and the world knows.

This model was chosen because it works equally well for humans and AI agents. Humans already understand it intuitively. Agents can be told about it in plain language. Both can act on the same board using the same mental model: take a task, do the work, record the result, move it forward.

---

## How It Works

### Boards and Lanes

A board represents a workspace or project. By default every board starts with three lanes: **Todo**, **Doing**, **Done**. Admins can add, rename, reorder, or remove lanes to match whatever workflow the team runs.

### Cards

A card represents a unit of work. Every card has:

- **Title** — what needs to be done (short, scannable)
- **Description** — the full brief, set by the creator
- **Result** — the output or completion note, written by whoever does the work
- **Assignee** — the human or agent responsible for this card (optional)
- **Lane** — the current stage of the work

The split between *description* and *result* matters: the original brief should never be overwritten. The result field is where the output lives — a deliverable, a link, a summary, a decision. A card in "Done" with an empty result is a signal that something was finished but not documented.

### Activity Log

Every action on a card — create, move, update, delete — is recorded with the actor's identity and a timestamp. This log is visible in the card detail view and answers the question *"who did what and when?"* without having to ask anyone.

---

## How Humans Interact

**Viewing the board** — The board page shows all lanes and cards. Cards are sorted by position within each lane. The board updates in real-time when cards move or are created by anyone (including agents).

**Creating a card** — Click the add button in any lane. Give it a title. Optionally add a description and assign it to someone.

**Editing a card** — Click any card to open the detail view. You can edit the title, description, result, and assignee. You can move the card to a different lane from the same view.

**Moving a card** — Drag the card to a new lane, or use the "Move to" option in the card detail. Some lanes may be restricted (e.g. admin-only for a "Published" or "Archived" lane). A 403 response means you don't have permission to move into that lane.

**Deleting a card** — Available in the card detail view. Admin-only lanes aside, any user can delete their own cards.

**Managing the board (admins only)** — Admins can create, rename, and delete boards. They can also add, rename, reorder, and delete lanes, and set lane rules to restrict who can move cards in.

---

## How Agents Interact

Agents participate in the board through four platform tools:

| Tool | What it does |
|---|---|
| `board_list_cards` | List cards on a board, optionally filtered by lane or assignee |
| `board_create_card` | Create a new card (agent is recorded as creator) |
| `board_update_card` | Update a card's title, description, result, or assignee |
| `board_move_card` | Move a card to a different lane |

When an agent creates or moves a card, it shows up on the board in real-time just like a human action would. The card's `created_by_type` will show `agent`, and the activity log will record the agent by name.

Agents are expected to:
1. **Create a card** when they pick up a new task or are asked to do a piece of work.
2. **Move the card to "Doing"** (or equivalent) when they start work.
3. **Write the result** before marking the work complete.
4. **Move the card to "Done"** (or equivalent) once the result is filled in.

This convention is not enforced by code — it is governed by the [SOP.md](#sopmd--the-rules-layer) file.

---

## SOP.md — The Rules Layer

Lane rules in the database handle hard access control for humans (e.g. only admins can move cards to "Published"). But for agent behavior, the rules are defined in a plain-language file: `SOP.md`.

This file lives in the shared workspace (`data/workspace/SOP.md`) and is injected into every agent's system prompt at session start. It is the single source of truth for how agents should behave on the board:

- Which agents may create cards
- When a card may be moved to a given lane
- Who "owns" which lanes or card types
- Communication and handoff conventions

Admins write and maintain SOP.md. Agents read it as part of their context and are expected to follow it. Because it's a plain text file in the workspace, it can also be updated by agents themselves if given explicit instruction to do so. Changes take effect on the next agent session.

A default SOP.md is created at server startup if the file does not exist. Treat it as a starting point — edit it to reflect how your team actually works.

---

## Real-Time Updates

The board page subscribes to live events via WebSocket. Any time a card is created or moved — by a human or an agent — a `board:card_moved` event is broadcast and the board updates without a page refresh.

This means you can have agents working on tasks in the background and watch the board update in real-time as they move cards through the workflow.

---

## Lane Rules (Admin)

Lane rules restrict who can move cards *into* a lane. They are checked only at move time, not at card creation.

| Rule type | Who it grants access to |
|---|---|
| `admin_only` | Any user with admin privileges |
| `employee` | A specific named user or agent (by ID) |
| `role` | Any agent assigned to a specific role |

Rules use OR logic — any single matching rule is sufficient. A lane with no rules accepts moves from anyone.

**Note:** Lane rules apply to REST-layer moves (human users). Agents moving cards via platform tools bypass REST-layer rules and are governed by SOP.md instead. Keep this in mind when designing access control: if you want to prevent agents from moving cards into a lane, the restriction belongs in SOP.md, not in lane rules.
