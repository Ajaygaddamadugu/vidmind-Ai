import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import fs from 'fs';
import path from 'path';
import { env } from '../config/env';

export type Db = Database<sqlite3.Database, sqlite3.Statement>;
let db: Db;

async function addColumnIfMissing(table: string, column: string, type: string) {
  const columns: { name: string }[] = await db.all(`PRAGMA table_info(${table})`);
  if (!columns.some((c) => c.name === column)) {
    await db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
    console.log(`[db] migration: added ${table}.${column}`);
  }
}

export async function initDb(): Promise<Db> {
  if (db) return db;

  fs.mkdirSync(path.dirname(env.DATABASE_URL), { recursive: true });
  db = await open({ filename: env.DATABASE_URL, driver: sqlite3.Database });

  await db.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;

    CREATE TABLE IF NOT EXISTS videos (
      id TEXT PRIMARY KEY,               -- YouTube video ID
      url TEXT NOT NULL,
      title TEXT,
      channel TEXT,
      duration INTEGER,
      transcript_json TEXT,              -- English (or best available) segments
      formats_json TEXT,                 -- { qualities, audioTracks }
      summary TEXT,                      -- cached summary JSON
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS video_embeddings (
      video_id TEXT PRIMARY KEY REFERENCES videos(id) ON DELETE CASCADE,
      model TEXT NOT NULL,
      chunks_json TEXT NOT NULL,
      embeddings_json TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS chat_sessions (
      id TEXT PRIMARY KEY,
      video_id TEXT REFERENCES videos(id) ON DELETE CASCADE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS chat_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT REFERENCES chat_sessions(id) ON DELETE CASCADE,
      role TEXT CHECK(role IN ('user','assistant')),
      content TEXT NOT NULL,
      sources_json TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages(session_id, id);
  `);

  await addColumnIfMissing('videos', 'formats_json', 'TEXT');
  await addColumnIfMissing('videos', 'transcript_meta_json', 'TEXT');
  await addColumnIfMissing('videos', 'original_transcript_json', 'TEXT');
  await addColumnIfMissing('videos', 'transcript_status', 'TEXT'); // 'ready' | 'none' | NULL (unknown)
  await addColumnIfMissing('chat_messages', 'sources_json', 'TEXT');

  console.log(`[db] ready at ${env.DATABASE_URL}`);
  return db;
}

export function getDb(): Db {
  if (!db) throw new Error('Database not initialized. Call initDb() first.');
  return db;
}
