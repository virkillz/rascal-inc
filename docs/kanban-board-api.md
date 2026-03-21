# Kanban Board API

Base path: `/api/boards`

---

## Data Schema

### `Board`

| Field | Type | Description |
|---|---|---|
| `id` | `string` (UUID) | Primary key |
| `name` | `string` | Board display name |
| `created_at` | `string` (ISO datetime) | Creation timestamp |

### `Lane`

| Field | Type | Description |
|---|---|---|
| `id` | `string` (UUID) | Primary key |
| `board_id` | `string` | Parent board (FK → boards, cascade delete) |
| `name` | `string` | Lane display name |
| `position` | `number` | Sort order (0-indexed, ascending) |

### `Card`

| Field | Type | Description |
|---|---|---|
| `id` | `string` (UUID) | Primary key |
| `board_id` | `string` | Parent board (FK → boards, cascade delete) |
| `lane_id` | `string` | Current lane (FK → lanes) |
| `title` | `string` | Card title |
| `description` | `string` | Task brief set by the creator (default `""`) |
| `result` | `string` | Output or completion note written by the assignee (default `""`) |
| `assignee_id` | `string \| null` | ID of assigned user or agent |
| `assignee_type` | `"agent" \| "user" \| null` | Discriminates assignee type |
| `created_by` | `string` | ID of creator |
| `created_by_type` | `"user" \| "agent"` | Type of creator |
| `position` | `number` | Sort order within lane |
| `created_at` | `string` | Creation timestamp |
| `updated_at` | `string` | Last update timestamp |

### `CardEvent`

| Field | Type | Description |
|---|---|---|
| `id` | `number` | Auto-increment primary key |
| `card_id` | `string` | Card this event belongs to (not a FK — survives card deletion) |
| `board_id` | `string` | Parent board |
| `actor_id` | `string` | ID of the user or agent that performed the action |
| `actor_type` | `"user" \| "agent"` | Discriminates actor type |
| `action` | `"created" \| "moved" \| "updated" \| "deleted"` | What happened |
| `meta` | `string` (JSON) | Action-specific detail (see below) |
| `created_at` | `string` | Event timestamp |

**`meta` examples by action:**

| Action | Example `meta` |
|---|---|
| `created` | `{ "lane": "Todo", "title": "Write script" }` |
| `moved` | `{ "from_lane": "Todo", "to_lane": "Doing" }` |
| `updated` | `{ "changed": ["title", "result"] }` |
| `deleted` | `{ "title": "Write script" }` |

### `LaneRule`

| Field | Type | Description |
|---|---|---|
| `id` | `string` (UUID) | Primary key |
| `lane_id` | `string` | Parent lane (FK → lanes, cascade delete) |
| `rule_type` | `"admin_only" \| "role" \| "employee"` | Rule kind |
| `target_id` | `string \| null` | Required for `role` and `employee` types |

### Full Board response

`GET /api/boards/:id` returns a `Board` merged with:

```json
{
  "lanes": [Lane],
  "cards": [Card],
  "rules": [LaneRule]
}
```

Lanes and cards are sorted by `position ASC`. Rules include all rules for all lanes on the board.

---

## Endpoints

### Boards

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/boards` | User | List all boards (ordered by `created_at ASC`) |
| `GET` | `/api/boards/:id` | User | Get full board (lanes + cards + rules) |
| `POST` | `/api/boards` | **Admin** | Create a board |
| `PUT` | `/api/boards/:id` | **Admin** | Rename a board |
| `DELETE` | `/api/boards/:id` | **Admin** | Delete board (cascades to lanes, cards, rules) |

**`POST /api/boards`** — request body:

```json
{ "name": "string (required)" }
```

Automatically seeds 3 default lanes: `Todo` (pos 0), `Doing` (pos 1), `Done` (pos 2). Returns the full board object.

---

### Lanes

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/boards/:id/lanes` | **Admin** | Add a lane to a board |
| `PUT` | `/api/boards/:boardId/lanes/:laneId` | **Admin** | Rename / reorder a lane |
| `DELETE` | `/api/boards/:boardId/lanes/:laneId` | **Admin** | Delete a lane |

**`POST`** — request body:

```json
{
  "name": "string (required)",
  "position": "number (optional, defaults to end)"
}
```

**`PUT`** — request body (all optional, falls back to current values):

```json
{
  "name": "string",
  "position": "number"
}
```

---

### Lane Rules

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/boards/:boardId/lanes/:laneId/rules` | User | List rules for a lane |
| `POST` | `/api/boards/:boardId/lanes/:laneId/rules` | **Admin** | Add a rule to a lane |
| `DELETE` | `/api/boards/:boardId/lanes/:laneId/rules/:ruleId` | **Admin** | Remove a rule |

**`POST`** — request body:

```json
{
  "ruleType": "admin_only | role | employee",
  "targetId": "string (required for role and employee)"
}
```

---

### Cards

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/boards/:id/cards` | User | Create a card |
| `PUT` | `/api/boards/:boardId/cards/:cardId` | User | Update card fields |
| `POST` | `/api/boards/:boardId/cards/:cardId/move` | User | Move card to a different lane |
| `DELETE` | `/api/boards/:boardId/cards/:cardId` | User | Delete a card |
| `GET` | `/api/boards/:boardId/cards/:cardId/events` | User | Get activity log for a card |

**`POST /cards`** — request body:

```json
{
  "laneId": "string (required)",
  "title": "string (required)",
  "description": "string (optional)",
  "result": "string (optional)",
  "assigneeId": "string (optional)",
  "assigneeType": "agent | user (optional)"
}
```

Position defaults to the end of the target lane. `created_by` / `created_by_type` are auto-set from the authenticated session (user via REST, agent via platform tools).

**`PUT /cards/:cardId`** — request body (all optional, falls back to current values):

```json
{
  "title": "string",
  "description": "string",
  "result": "string",
  "assigneeId": "string | null",
  "assigneeType": "agent | user | null"
}
```

**`POST /cards/:cardId/move`** — request body:

```json
{
  "laneId": "string (required)",
  "position": "number (optional, defaults to end of lane)"
}
```

Subject to lane rules — returns `403` if the caller lacks permission.

---

## Lane Rule Logic

Rules control who can **move cards into** a lane. They are evaluated only at move time (`POST /cards/:cardId/move`), not at card creation.

| Rule type | `target_id` | Grants access to |
|---|---|---|
| `admin_only` | `null` | Any user with `is_admin = true` |
| `employee` | user or agent ID | That specific actor |
| `role` | role ID | Any agent assigned to that role |

**Evaluation rules:**

- A lane with **no rules** allows anyone to move cards into it.
- Rules are evaluated with **OR** logic — a single matching rule grants access.
- Card **creation** bypasses lane rule checks; only moves are gated.
- Agents can only match `employee` and `role` rules, not `admin_only`.

---

## Real-time Events

Two actions emit a `board:card_moved` event via `EventBus` → WebSocket broadcast:

| Trigger | Notes |
|---|---|
| Card created | Initial lane placement emits as a move |
| Card moved | Emitted after the lane update is persisted |

**Event payload:**

```ts
{
  type: 'board:card_moved',
  cardId: string,
  boardId: string,
  laneId: string,   // destination lane
  title: string
}
```

Subscribe via the `useAppEvents()` hook on the frontend to receive live updates.
