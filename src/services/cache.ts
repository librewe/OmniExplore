import { openDB, type IDBPDatabase } from "idb";
import type { WorkGroup, StoredFile, Session, Node } from "@/types";

const DB_NAME = "omni_explore_db";
const DB_VERSION = 5;

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
        if (!db.objectStoreNames.contains("nodes")) {
          const store = db.createObjectStore("nodes", { keyPath: "id" });
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

export async function putNode(node: Node): Promise<void> {
  const db = await getDB();
  await db.put("nodes", { ...node, updated_at: Date.now() });
}

export async function getNode(id: string): Promise<Node | undefined> {
  const db = await getDB();
  return db.get("nodes", id);
}

export async function getAllNodes(groupId?: string): Promise<Node[]> {
  const db = await getDB();
  const all = await db.getAll("nodes");
  return groupId === undefined ? all : all.filter((n) => n.groupId === groupId);
}

export async function deleteNode(id: string): Promise<void> {
  const db = await getDB();
  await db.delete("nodes", id);
}

/**
 * 数据迁移：
 * 1. 旧字段 parentEntryId → parentSessionId（递归处理整棵树，含嵌套子 Session）
 * 2. 旧 Entry.sessionId 字段清除
 * 3. 未归属工作组的根 Session 补 defaultGroupId（首个工作组）
 * 4. 根 Session → 主题 Node 包装（2026-08-17 模型重构）：同标题根 Session 合并为一个 Node，
 *    仅当 nodes store 为空且存在根 Session 时执行（幂等）
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

  const roots: Session[] = [];
  for (const s of all) {
    walk(s);
    if (!s.parentSessionId) {
      if (s.groupId === undefined && defaultGroupId) s.groupId = defaultGroupId;
      roots.push(s);
    }
    await db.put("sessions", s);
  }

  if (roots.length > 0) {
    const existingNodes = await db.getAll("nodes");
    if (existingNodes.length === 0) {
      const byTitle = new Map<string, Session[]>();
      for (const s of roots) {
        // 合并键须含 groupId：同标题但属于不同工作组的根 Session 不得合并（否则 groupId 归属丢失）
        const key = `${s.groupId ?? ""}|${s.title.toLowerCase()}`;
        if (!byTitle.has(key)) byTitle.set(key, []);
        byTitle.get(key)!.push(s);
      }
      for (const sessions of byTitle.values()) {
        const first = sessions[0];
        const node: Node = {
          id: crypto.randomUUID(),
          title: first.title,
          sessions,
          groupId: first.groupId,
          created_at: Math.min(...sessions.map((s) => s.created_at || Date.now())),
          updated_at: Math.max(...sessions.map((s) => s.updated_at || 0)),
        };
        await db.put("nodes", node);
      }
      await db.clear("sessions");
    }
  }
}
