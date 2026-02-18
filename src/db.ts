import fs from "fs";
import path from "path";
import sqlite3 from "sqlite3";
import { open, type Database } from "sqlite";
import { config } from "./config";
import type { Todo, TodoInput } from "./types";

let db: Database | null = null;

const ensureDbDirectory = () => {
  const dir = path.dirname(config.dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
};

export const getDb = async (): Promise<Database> => {
  if (db) {
    return db;
  }

  ensureDbDirectory();
  db = await open({
    filename: config.dbPath,
    driver: sqlite3.Database,
  });

  await db.exec(`
    CREATE TABLE IF NOT EXISTS todos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      notes TEXT,
      due_date TEXT,
      completed INTEGER NOT NULL DEFAULT 0,
      notify_on_complete INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      completed_at TEXT
    );
  `);

  const columns = (await db.all("PRAGMA table_info(todos)")) as Array<{ name: string }>;
  const hasNotifyColumn = columns.some((column) => column.name === "notify_on_complete");
  const hasCreatedAtColumn = columns.some((column) => column.name === "created_at");
  if (!hasCreatedAtColumn) {
    await db.exec("ALTER TABLE todos ADD COLUMN created_at TEXT");
    await db.run("UPDATE todos SET created_at = ? WHERE created_at IS NULL", new Date().toISOString());
  }
  if (!hasNotifyColumn) {
    await db.exec("ALTER TABLE todos ADD COLUMN notify_on_complete INTEGER NOT NULL DEFAULT 0");
  }

  await db.exec("CREATE INDEX IF NOT EXISTS idx_todos_completed ON todos (completed, completed_at);");
  await db.exec(`
    CREATE TABLE IF NOT EXISTS app_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      email_recipient TEXT
    );
  `);
  await db.run("INSERT OR IGNORE INTO app_settings (id, email_recipient) VALUES (1, NULL)");

  return db;
};

export const createTodo = async (input: TodoInput): Promise<Todo> => {
  const database = await getDb();
  const now = new Date().toISOString();
  const result = await database.run(
    "INSERT INTO todos (title, notes, due_date, completed, notify_on_complete, created_at, completed_at) VALUES (?, ?, ?, 0, ?, ?, NULL)",
    input.title.trim(),
    input.notes?.trim() || null,
    input.dueDate || null,
    input.notifyOnComplete ? 1 : 0,
    now,
  );

  return (await database.get("SELECT * FROM todos WHERE id = ?", result.lastID)) as Todo;
};

export const listTodos = async (status: "all" | "active" | "completed" = "all"): Promise<Todo[]> => {
  const database = await getDb();
  if (status === "active") {
    return (await database.all("SELECT * FROM todos WHERE completed = 0 ORDER BY created_at DESC")) as Todo[];
  }
  if (status === "completed") {
    return (await database.all("SELECT * FROM todos WHERE completed = 1 ORDER BY completed_at DESC")) as Todo[];
  }
  return (await database.all("SELECT * FROM todos ORDER BY completed ASC, created_at DESC")) as Todo[];
};

export const getTodoById = async (id: number): Promise<Todo | undefined> => {
  const database = await getDb();
  return (await database.get("SELECT * FROM todos WHERE id = ?", id)) as Todo | undefined;
};

export const setTodoCompleted = async (id: number, completed: boolean): Promise<Todo | undefined> => {
  const database = await getDb();
  const completedAt = completed ? new Date().toISOString() : null;
  await database.run(
    "UPDATE todos SET completed = ?, completed_at = ? WHERE id = ?",
    completed ? 1 : 0,
    completedAt,
    id,
  );

  return getTodoById(id);
};

export const deleteTodoById = async (id: number): Promise<boolean> => {
  const database = await getDb();
  const result = await database.run("DELETE FROM todos WHERE id = ?", id);
  return (result.changes ?? 0) > 0;
};

export const updateTodoNotes = async (id: number, notes: string | null): Promise<Todo | undefined> => {
  const database = await getDb();
  await database.run("UPDATE todos SET notes = ? WHERE id = ?", notes, id);
  return getTodoById(id);
};

export const updateTodoDetails = async (
  id: number,
  title: string,
  notes: string | null,
): Promise<Todo | undefined> => {
  const database = await getDb();
  await database.run("UPDATE todos SET title = ?, notes = ? WHERE id = ?", title, notes, id);
  return getTodoById(id);
};

export const completedInRange = async (startIso: string, endIso: string): Promise<Todo[]> => {
  const database = await getDb();
  return (await database.all(
    `SELECT * FROM todos
     WHERE completed = 1
       AND completed_at >= ?
       AND completed_at < ?
     ORDER BY completed_at ASC`,
    startIso,
    endIso,
  )) as Todo[];
};

export const getEmailRecipient = async (): Promise<string | null> => {
  const database = await getDb();
  const row = (await database.get("SELECT email_recipient FROM app_settings WHERE id = 1")) as
    | { email_recipient: string | null }
    | undefined;
  return row?.email_recipient ?? null;
};

export const setEmailRecipient = async (email: string): Promise<string> => {
  const database = await getDb();
  await database.run(
    "INSERT INTO app_settings (id, email_recipient) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET email_recipient = excluded.email_recipient",
    email,
  );
  return email;
};
