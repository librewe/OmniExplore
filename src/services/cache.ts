import { openDB, type IDBPDatabase } from "idb";
import type { WorkGroup, StoredFile, Session } from "@/types";

const DB_NAME = "omni_explore_db";
const DB_VERSION = 4;

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDB(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        if (!db.objectStoreNames.contains("work_groups")) {
          const store = db.createObjectStore("work_groups", { keyPath: "id" });
          store.createIndex("name", "name");
          store.createIndex("updated_at", "updated_at");
        }
        if (!db.objectStoreNames.contains("files")) {
          db.createObjectStore("files", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("sessions")) {
          const store = db.createObjectStore("sessions", { keyPath: "id" });
          store.createIndex("title", "title");
          store.createIndex("updated_at", "updated_at");
        }
      },
    });
  }
  return dbPromise;
}

export async function getWorkGroup(id: string): Promise<WorkGroup | undefined> {
  const db = await getDB();
  return db.get("work_groups", id);
}

export async function getAllWorkGroups(): Promise<WorkGroup[]> {
  const db = await getDB();
  return db.getAll("work_groups");
}

export async function putWorkGroup(group: WorkGroup): Promise<void> {
  const db = await getDB();
  await db.put("work_groups", { ...group, updated_at: Date.now() });
}

export async function deleteWorkGroup(id: string): Promise<void> {
  const db = await getDB();
  await db.delete("work_groups", id);
}

export async function putFile(file: StoredFile): Promise<void> {
  const db = await getDB();
  await db.put("files", file);
}

export async function getFile(id: string): Promise<StoredFile | undefined> {
  const db = await getDB();
  return db.get("files", id);
}

export async function getAllFiles(): Promise<StoredFile[]> {
  const db = await getDB();
  return db.getAll("files");
}

export async function deleteFile(id: string): Promise<void> {
  const db = await getDB();
  await db.delete("files", id);
}

export async function putSession(session: Session): Promise<void> {
  const db = await getDB();
  await db.put("sessions", { ...session, updated_at: Date.now() });
}

export async function getSession(id: string): Promise<Session | undefined> {
  const db = await getDB();
  return db.get("sessions", id);
}

export async function getAllSessions(groupId?: string): Promise<Session[]> {
  const db = await getDB();
  const all = await db.getAll("sessions");
  return all.filter(
    (s) => !s.parentSessionId && (groupId === undefined || s.groupId === groupId)
  );
}

export async function deleteSession(id: string): Promise<void> {
  const db = await getDB();
  await db.delete("sessions", id);
}

/**
 * 数据迁移（2026-08-13 模型重构）：
 * 1. 旧字段 parentEntryId → parentSessionId（递归处理整棵树，含嵌套子 Session）
 * 2. 旧 Entry.sessionId 字段清除
 * 3. 未归属工作组的根 Session 补 defaultGroupId（首个工作组）
 */
export async function migrateData(): Promise<void> {
  const db = await getDB();
  let groups = await db.getAll("work_groups");
  const all = await db.getAll("sessions");
  if (groups.length === 0 && all.length > 0) {
    const fallback: WorkGroup = {
      id: crypto.randomUUID(),
      name: "默认",
      guide_map: null,
      created_at: Date.now(),
      updated_at: Date.now(),
    };
    await db.put("work_groups", fallback);
    groups = [fallback];
  }
  const defaultGroupId = groups[0]?.id;

  const walk = (node: Session): void => {
    const legacy = node as unknown as { parentEntryId?: string };
    if (legacy.parentEntryId !== undefined) {
      node.parentSessionId = legacy.parentEntryId;
      delete legacy.parentEntryId;
    }
    node.entries = (node.entries || []).map((e) => {
      const clean = e as unknown as { sessionId?: string };
      delete clean.sessionId;
      (e.children || []).forEach(walk);
      return { ...e, children: e.children || [] };
    });
  };

  for (const s of all) {
    walk(s);
    if (!s.parentSessionId && s.groupId === undefined && defaultGroupId) {
      s.groupId = defaultGroupId;
    }
    await db.put("sessions", s);
  }
}
