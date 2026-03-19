// Node 22.5+ built-in SQLite (no native build required)
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — node:sqlite types not yet in @types/node but available at runtime
import { DatabaseSync } from 'node:sqlite'
import path from 'path'
import fs from 'fs'
import { randomUUID } from 'crypto'

type DB = InstanceType<typeof DatabaseSync>

let _db: DB | null = null

export function getDb(): DB {
  if (!_db) throw new Error('Database not initialized. Call initDb() first.')
  return _db
}

export function initDb(dataDir: string): DB {
  fs.mkdirSync(dataDir, { recursive: true })
  const dbPath = path.join(dataDir, 'rascal.db')
  _db = new DatabaseSync(dbPath)
  runMigrations(_db)
  seedInitialData(_db)
  return _db
}

function addColumnIfNotExists(db: DB, table: string, column: string, definition: string): void {
  try {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
  } catch {
    // Column already exists — ignore
  }
}

function runMigrations(db: DB): void {
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    -- ── Core settings ─────────────────────────────────────────────────────────

    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    -- ── Employees: AI Agents ──────────────────────────────────────────────────

    CREATE TABLE IF NOT EXISTS agents (
      id            TEXT PRIMARY KEY,
      name          TEXT NOT NULL,
      role          TEXT NOT NULL,
      description   TEXT NOT NULL DEFAULT '',
      system_prompt TEXT NOT NULL DEFAULT '',
      model_config  TEXT NOT NULL DEFAULT '{}',
      source        TEXT NOT NULL DEFAULT 'user',
      avatar_color  TEXT NOT NULL DEFAULT '#7c6af7',
      is_active     INTEGER NOT NULL DEFAULT 1,
      created_at    TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- ── Employees: Human Users ────────────────────────────────────────────────

    CREATE TABLE IF NOT EXISTS users (
      id            TEXT PRIMARY KEY,
      username      TEXT NOT NULL UNIQUE,
      display_name  TEXT NOT NULL,
      avatar_color  TEXT NOT NULL DEFAULT '#7c6af7',
      password_hash TEXT NOT NULL,
      is_admin      INTEGER NOT NULL DEFAULT 0,
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- ── Roles ─────────────────────────────────────────────────────────────────

    CREATE TABLE IF NOT EXISTS roles (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL UNIQUE,
      description TEXT NOT NULL DEFAULT '',
      prompt      TEXT NOT NULL DEFAULT '',
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Agent ↔ Role junction (many-to-many)
    CREATE TABLE IF NOT EXISTS agent_roles (
      agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
      role_id  TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
      PRIMARY KEY (agent_id, role_id)
    );

    -- ── Per-agent data ────────────────────────────────────────────────────────

    CREATE TABLE IF NOT EXISTS chat_messages (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id   TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
      role       TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
      content    TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_chat_messages_agent ON chat_messages(agent_id, created_at);

    CREATE TABLE IF NOT EXISTS agent_memory (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id   TEXT    NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
      content    TEXT    NOT NULL,
      created_at TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT    NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_agent_memory_agent ON agent_memory(agent_id, created_at);

    CREATE TABLE IF NOT EXISTS agent_todos (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id     TEXT    NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
      text         TEXT    NOT NULL,
      completed    INTEGER NOT NULL DEFAULT 0,
      completed_at TEXT,
      created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_agent_todos_agent ON agent_todos(agent_id, created_at);

    CREATE TABLE IF NOT EXISTS agent_schedules (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id          TEXT    NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
      cron              TEXT    NOT NULL,
      prompt            TEXT    NOT NULL,
      label             TEXT    NOT NULL DEFAULT '',
      enabled           INTEGER NOT NULL DEFAULT 1,
      skip_if_no_todos  INTEGER NOT NULL DEFAULT 0,
      last_run_at       TEXT,
      next_run_at       TEXT,
      created_at        TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    -- ── Plugins ───────────────────────────────────────────────────────────────

    CREATE TABLE IF NOT EXISTS plugins (
      id           TEXT PRIMARY KEY,
      display_name TEXT    NOT NULL,
      description  TEXT    NOT NULL DEFAULT '',
      configured   INTEGER NOT NULL DEFAULT 0
    );

    -- ── Kanban Boards ─────────────────────────────────────────────────────────

    CREATE TABLE IF NOT EXISTS boards (
      id         TEXT PRIMARY KEY,
      name       TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS lanes (
      id       TEXT PRIMARY KEY,
      board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
      name     TEXT NOT NULL,
      position INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS cards (
      id              TEXT PRIMARY KEY,
      board_id        TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
      lane_id         TEXT NOT NULL REFERENCES lanes(id),
      title           TEXT NOT NULL,
      description     TEXT NOT NULL DEFAULT '',
      assignee_id     TEXT,
      assignee_type   TEXT,
      created_by      TEXT NOT NULL,
      created_by_type TEXT NOT NULL,
      position        INTEGER NOT NULL DEFAULT 0,
      created_at      TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_cards_board ON cards(board_id, lane_id);

    -- Lane movement rules: who can move cards INTO this lane.
    -- No rules = anyone can move. rule_type: 'admin_only' | 'role' | 'employee'
    CREATE TABLE IF NOT EXISTS lane_rules (
      id        TEXT PRIMARY KEY,
      lane_id   TEXT NOT NULL REFERENCES lanes(id) ON DELETE CASCADE,
      rule_type TEXT NOT NULL,
      target_id TEXT
    );

    -- ── Auth sessions ────────────────────────────────────────────────────────

    CREATE TABLE IF NOT EXISTS sessions (
      token      TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- ── Channels + Messages ───────────────────────────────────────────────────

    CREATE TABLE IF NOT EXISTS channels (
      id         TEXT PRIMARY KEY,
      name       TEXT NOT NULL UNIQUE,
      is_dm      INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS channel_members (
      channel_id  TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
      member_id   TEXT NOT NULL,
      member_type TEXT NOT NULL,
      PRIMARY KEY (channel_id, member_id)
    );

    CREATE TABLE IF NOT EXISTS channel_messages (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      channel_id  TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
      sender_id   TEXT NOT NULL,
      sender_type TEXT NOT NULL,
      content     TEXT NOT NULL,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_channel_messages ON channel_messages(channel_id, created_at);
  `)

  // Additive column migrations for existing installs
  addColumnIfNotExists(db, 'agents', 'is_active', 'INTEGER NOT NULL DEFAULT 1')
  addColumnIfNotExists(db, 'agent_schedules', 'skip_if_no_todos', 'INTEGER NOT NULL DEFAULT 0')
}

function seedInitialData(db: DB): void {
  // Seed #public channel if not present
  const publicChannel = db.prepare("SELECT id FROM channels WHERE name = 'public'").get()
  if (!publicChannel) {
    db.prepare("INSERT INTO channels (id, name, is_dm) VALUES (?, 'public', 0)")
      .run(randomUUID())
  }

  // Seed default board if none exist
  const boardCount = (db.prepare('SELECT COUNT(*) as c FROM boards').get() as { c: number }).c
  if (boardCount === 0) {
    const boardId = randomUUID()
    db.prepare("INSERT INTO boards (id, name) VALUES (?, 'Main Board')").run(boardId)
    const lanes = ['Todo', 'Doing', 'Done']
    lanes.forEach((name, i) => {
      db.prepare('INSERT INTO lanes (id, board_id, name, position) VALUES (?, ?, ?, ?)')
        .run(randomUUID(), boardId, name, i)
    })
  }

  // Seed default Tech Magazine roles if none exist
  const roleCount = (db.prepare('SELECT COUNT(*) as c FROM roles').get() as { c: number }).c
  if (roleCount === 0) {
    const defaultRoles = [
      {
        name: 'Writer',
        description: 'Researches topics and writes articles.',
        prompt: 'You are a skilled writer. Your primary responsibility is to research topics thoroughly and produce well-structured, engaging articles. Write clearly and concisely. Always cite your sources in your work notes.',
      },
      {
        name: 'Editor',
        description: 'Reviews and refines content for quality and consistency.',
        prompt: 'You are a meticulous editor. Review all content for clarity, grammar, factual accuracy, and consistency with the publication\'s voice. Provide constructive feedback and make improvements directly when authorised.',
      },
      {
        name: 'Researcher',
        description: 'Gathers facts, data, and sources to support content.',
        prompt: 'You are a thorough researcher. Your job is to find accurate, up-to-date information on assigned topics. Summarise findings clearly and organise them so writers and editors can use them directly.',
      },
      {
        name: 'Publisher',
        description: 'Manages publication schedule and final approvals.',
        prompt: 'You are the publisher. You oversee the production pipeline, ensure deadlines are met, and give final approval before content is released. Coordinate between writers, editors, and external platforms.',
      },
      {
        name: 'Art Director',
        description: 'Oversees visual assets and image generation.',
        prompt: 'You are the art director. You are responsible for all visual content — cover images, illustrations, and layout decisions. Work with the writer to ensure visuals match the article tone and generate images using available tools.',
      },
    ]
    for (const r of defaultRoles) {
      db.prepare('INSERT INTO roles (id, name, description, prompt) VALUES (?, ?, ?, ?)')
        .run(randomUUID(), r.name, r.description, r.prompt)
    }
  }
}

// ── Settings helpers ──────────────────────────────────────────────────────────

export function getSetting(key: string): string | null {
  const stmt = getDb().prepare('SELECT value FROM settings WHERE key = ?')
  const row = stmt.get(key) as { value: string } | undefined
  return row?.value ?? null
}

export function setSetting(key: string, value: string): void {
  getDb().prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value)
}

export function isFirstRun(): boolean {
  return getSetting('company_name') === null
}

// ── Row type definitions ──────────────────────────────────────────────────────

export interface MemoryRow {
  id: number
  agent_id: string
  content: string
  created_at: string
  updated_at: string
}

export interface TodoRow {
  id: number
  agent_id: string
  text: string
  completed: number
  completed_at: string | null
  created_at: string
}

export interface ScheduleRow {
  id: number
  agent_id: string
  cron: string
  prompt: string
  label: string
  enabled: number
  skip_if_no_todos: number
  last_run_at: string | null
  next_run_at: string | null
  created_at: string
}

export interface UserRow {
  id: string
  username: string
  display_name: string
  avatar_color: string
  password_hash: string
  is_admin: number
  created_at: string
}

export interface RoleRow {
  id: string
  name: string
  description: string
  prompt: string
  created_at: string
}

export interface BoardRow {
  id: string
  name: string
  created_at: string
}

export interface LaneRow {
  id: string
  board_id: string
  name: string
  position: number
}

export interface CardRow {
  id: string
  board_id: string
  lane_id: string
  title: string
  description: string
  assignee_id: string | null
  assignee_type: string | null
  created_by: string
  created_by_type: string
  position: number
  created_at: string
  updated_at: string
}

export interface LaneRuleRow {
  id: string
  lane_id: string
  rule_type: string
  target_id: string | null
}

export interface ChannelRow {
  id: string
  name: string
  is_dm: number
  created_at: string
}

export interface ChannelMessageRow {
  id: number
  channel_id: string
  sender_id: string
  sender_type: string
  content: string
  created_at: string
}

export interface PluginRow {
  id: string
  display_name: string
  description: string
  configured: number
}

// ── Query helpers ─────────────────────────────────────────────────────────────

export function getAgentMemory(agentId: string): MemoryRow[] {
  return getDb()
    .prepare('SELECT * FROM agent_memory WHERE agent_id = ? ORDER BY created_at ASC')
    .all(agentId) as unknown as MemoryRow[]
}

export function getAgentTodos(agentId: string, onlyOpen = false): TodoRow[] {
  const query = onlyOpen
    ? 'SELECT * FROM agent_todos WHERE agent_id = ? AND completed = 0 ORDER BY created_at ASC'
    : 'SELECT * FROM agent_todos WHERE agent_id = ? ORDER BY created_at ASC'
  return getDb().prepare(query).all(agentId) as unknown as TodoRow[]
}

export function getAgentRoles(agentId: string): RoleRow[] {
  return getDb()
    .prepare(`
      SELECT r.* FROM roles r
      JOIN agent_roles ar ON ar.role_id = r.id
      WHERE ar.agent_id = ?
    `)
    .all(agentId) as unknown as RoleRow[]
}

export function getPublicChannelId(): string {
  const row = getDb().prepare("SELECT id FROM channels WHERE name = 'public' AND is_dm = 0").get() as { id: string } | undefined
  if (!row) throw new Error('#public channel not found — was the DB seeded?')
  return row.id
}

export function getRecentChannelMessages(channelId: string, limit = 50): ChannelMessageRow[] {
  return getDb()
    .prepare('SELECT * FROM channel_messages WHERE channel_id = ? ORDER BY created_at DESC LIMIT ?')
    .all(channelId, limit) as unknown as ChannelMessageRow[]
}
