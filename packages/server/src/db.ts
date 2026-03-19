// Node 22.5+ built-in SQLite (no native build required)
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — node:sqlite types not yet in @types/node but available at runtime
import { DatabaseSync } from 'node:sqlite'
import path from 'path'
import fs from 'fs'

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
  return _db
}

function runMigrations(db: DB): void {
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS agents (
      id            TEXT PRIMARY KEY,
      name          TEXT NOT NULL,
      role          TEXT NOT NULL,
      description   TEXT NOT NULL DEFAULT '',
      system_prompt TEXT NOT NULL DEFAULT '',
      model_config  TEXT NOT NULL DEFAULT '{}',
      source        TEXT NOT NULL DEFAULT 'user',
      avatar_color  TEXT NOT NULL DEFAULT '#7c6af7',
      created_at    TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );

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
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id     TEXT    NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
      cron         TEXT    NOT NULL,
      prompt       TEXT    NOT NULL,
      label        TEXT    NOT NULL DEFAULT '',
      enabled      INTEGER NOT NULL DEFAULT 1,
      last_run_at  TEXT,
      next_run_at  TEXT,
      created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
    );
  `)
}

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
  last_run_at: string | null
  next_run_at: string | null
  created_at: string
}

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
