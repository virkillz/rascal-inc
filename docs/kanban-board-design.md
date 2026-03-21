# Kanban Board — Design Analysis

## 1. Why Kanban is the Right Abstraction

Most task management systems force a choice: either structured enough for automation, or flexible enough for humans. Kanban sits at the intersection. Its core model (card → lane → board) maps naturally to any workflow that has stages, handoffs, and responsibility — which is essentially every workflow.

For rascal-inc, where humans and AI agents must collaborate on the same work, Kanban is especially well-suited:

- **Shared vocabulary.** Humans already understand it. Agents can be prompted to understand it trivially.
- **State as position.** The card's lane *is* its status. No separate status field to keep in sync.
- **Flexible without being formless.** Lanes define the workflow shape; cards define the work units. You can model almost anything with those two primitives.
- **Natural handoff points.** Moving a card to a new lane is a discrete, observable event — perfect for triggering agent actions or human review gates.

The platform already uses a similar event-driven handoff pattern in the pipeline/human-gate system. The Kanban board is that same pattern made general-purpose.

---

## 2. Current Implementation — What Exists

### Schema

| Table | Fields |
|---|---|
| `boards` | `id`, `name`, `created_at` |
| `lanes` | `id`, `board_id`, `name`, `position` |
| `cards` | `id`, `board_id`, `lane_id`, `title`, `description`, `assignee_id`, `assignee_type`, `created_by`, `created_by_type`, `position`, `created_at`, `updated_at` |
| `lane_rules` | `id`, `lane_id`, `rule_type` (`admin_only\|role\|employee`), `target_id` |

The schema covers the core card model well. Real-time updates flow through `EventBus` → WebSocket on `board:card_moved`.

### Gaps vs the Proposed Model

**1. No `result` field on cards.**
`description` is the only text field. There's no way to separate the immutable task brief from the mutable output produced by the assignee.

**2. Agents can't create cards via REST.**
`created_by_type` is hardcoded to `'user'` in `boards.ts:182`. An agent calling the REST endpoint would set the wrong creator type. More importantly, there are no board tools in `platform-tools.ts` at all — agents currently have no way to interact with the board.

**3. Lane rules are partially implemented but the rationale is shaky.**
The rule system (admin_only, role, employee) gates card *movement*. But card *creation* bypasses rules entirely (by design). This creates an inconsistency: you can restrict who moves a card into "Done" but anyone can create a card directly in "Done". The rules also only apply to REST callers — an agent with instructions to move a card would bypass them entirely since agents aren't wired to the rule check.

---

## 3. Proposed Changes to the Data Model

### Add `result` to cards

Separating task and result is the right call. A task brief is set by the creator and describes *what needs to be done*. The result is filled in by the assignee (human or agent) and describes *what was done* or delivers the output.

```sql
ALTER TABLE cards ADD COLUMN result TEXT NOT NULL DEFAULT '';
```

This also gives you a lightweight "done" signal: a card in the "Done" lane with an empty `result` is visually incomplete. Agents can be instructed to always populate `result` before moving a card forward.

Optionally add a `status` column (`open | in_progress | blocked | done`) but this may be redundant with lane position — skip for now.

### Keep `created_by_type` honest

The `created_by_type` column should reflect reality. Since agents will create cards, the insert in `boards.ts` needs to accept `'agent'` as a valid creator type when the caller is an agent (via an agent tool, not REST).

### No subtasks — create another card instead

Correct call. Subtasks create a parent-child tree that's hard to visualize on a board and hard for agents to reason about. A card dependency is better expressed as a `blocked_by` field (a card ID or a free-text note in `description`). For now, description is sufficient.

---

## 4. The SOP.md Argument — Rules vs Prompts

This is the most important design decision in the brainstorm.

### The case for removing `lane_rules`

The current rule system enforces constraints at the HTTP layer. But agents don't go through that HTTP layer for autonomous actions — they use platform tools. So any rule you enforce at the REST level is invisible to agents. If you also encode the same rule in the agent's system prompt, you now have two sources of truth that can diverge silently.

Example of the problem:
- Lane rule: "Only the 'editor' role can move cards to 'Review'"
- Agent system prompt: "When you finish a draft, move the card to 'Review'"
- The agent has the 'writer' role
- Result: REST returns 403, the agent fails, and the failure mode is confusing

The cleaner model: **SOP.md is the single source of truth for workflow rules.** Admin writes it in natural language. It gets included in agent system prompts. Humans read it too. No code enforces it — the social/prompt contract does.

```markdown
# SOP.md (example for video production)

- Only the "Producer" agent may create new project cards on the Production board.
- A card may only be moved to "Review" after the result field is filled in.
- The "Editor" agent owns cards in "Editing". Do not reassign without explicit instruction.
- Cards in "Done" are immutable. Open a new card to revise completed work.
```

### The case for keeping `lane_rules` (for human users)

The counterargument: rules are still useful for *human* users who aren't reading SOP.md and might accidentally move things. The `admin_only` rule type in particular is a simple guard that prevents non-admins from archiving or closing work.

**Recommendation:** Keep `lane_rules` in the schema but treat it as a UI-layer soft guard for humans only. Do not rely on it for agent behavior. Document this explicitly. Simplify the rule types to just `admin_only` and remove `role` / `employee` — those two types require you to keep rules in sync with agent role assignments, which is exactly the dual-source-of-truth problem.

---

## 5. Agent Integration — The Missing Piece

The board is currently a human-only interface. Agents need board tools to participate.

Minimum viable tool set for agents:

| Tool | Description |
|---|---|
| `board_list_cards` | List cards on a board, optionally filtered by lane or assignee |
| `board_create_card` | Create a card (with `created_by_type: 'agent'`) |
| `board_update_card` | Update title, description, result, or assignee |
| `board_move_card` | Move a card to a different lane |

These should live in `platform-tools.ts` alongside `workspace_read`, `workspace_write`, etc. The agent's system prompt (assembled in `agent-runner.ts`) can reference which boards the agent has access to.

The event bus already emits `board:card_moved` — that's sufficient for frontend reactivity. No new events needed for the MVP.

---

## 6. Modeling the Video Production Workflow

To make this concrete, here's what a video production workflow looks like on the Kanban model:

**Board:** "Production — Episode 42"

**Lanes:** `Brief` → `Scripting` → `Recording` → `Editing` → `Review` → `Published`

**Cards per lane:**
- "Write episode script" (assignee: ScriptWriter agent, result: the script text or workspace path)
- "Record voiceover" (assignee: human, result: link to audio file)
- "Edit rough cut" (assignee: Editor agent, result: workspace path to video)
- "Final review" (assignee: human producer, result: approval note)

**SOP.md rules:**
- ScriptWriter creates cards in "Scripting" when briefed.
- A card moves to "Recording" only after result is non-empty.
- Only the human Producer can move cards to "Published".

No subtasks needed. If the script requires research, the ScriptWriter creates a "Research competitors" card in "Scripting" and links it in the description. It gets done, moved to "Done", and the script card progresses.

---

## 7. SOP.md — Where It Lives and How It Works

SOP.md lives at `data/workspace/SOP.md` — inside the shared workspace directory that the Workspace page already manages. Admins edit it there, or agents with write access can update it on instruction.

It is injected into every agent's system prompt at session-creation time (read from disk in `buildSystemPrompt`). This means agents see it immediately without needing a tool call, and changes take effect on the next session.

A default SOP.md is seeded at server startup if the file doesn't exist, covering the basics:
- Which roles can create cards
- The convention of filling in `result` before marking a card done
- Communication norms

The platform prompt already says "Follow the Standard Operating Procedure in SOP.md" — this change makes that instruction load-bearing rather than aspirational.

---

## 8. Summary of Recommended Changes

| Area | Current | Recommended |
|---|---|---|
| Card model | `title`, `description` | Add `result` field |
| Agent card creation | Not possible | Add board tools to `platform-tools.ts` |
| Lane rules | `admin_only`, `role`, `employee` | Keep `admin_only` only; remove `role`/`employee` |
| Workflow rules | Enforced in app code | SOP.md as single source of truth for agent behavior |
| Subtasks | Not implemented | Don't implement; use linked cards via description |
| Dependencies | Not implemented | Free-text in description for now |
| Events | `board:card_moved` only | Sufficient for MVP; add `board:card_updated` later if needed |

The data model is 80% right. The two immediate gaps are the `result` field and agent tooling. The rules system is the piece worth rethinking most carefully — not because it's wrong, but because its scope needs to be clearly bounded to avoid conflicting with agent instructions.
