import { openDB, type IDBPDatabase } from "idb";
import type { ConceptNode, WorkGroup } from "@/types";

const DB_NAME = "omni_explore_db";
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDB(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("concept_nodes")) {
          const store = db.createObjectStore("concept_nodes", { keyPath: "id" });
          store.createIndex("term", "term");
          store.createIndex("updated_at", "updated_at");
        }
        if (!db.objectStoreNames.contains("work_groups")) {
          const store = db.createObjectStore("work_groups", { keyPath: "id" });
          store.createIndex("name", "name");
          store.createIndex("updated_at", "updated_at");
        }
      },
    });
  }
  return dbPromise;
}

export async function getConceptNode(id: string): Promise<ConceptNode | undefined> {
  const db = await getDB();
  return db.get("concept_nodes", id);
}

export async function getConceptNodeByTerm(term: string): Promise<ConceptNode | undefined> {
  const db = await getDB();
  return db.getFromIndex("concept_nodes", "term", term.toLowerCase());
}

export async function putConceptNode(node: ConceptNode): Promise<void> {
  const db = await getDB();
  await db.put("concept_nodes", { ...node, updated_at: Date.now() });
}

export async function getAllConceptNodes(): Promise<ConceptNode[]> {
  const db = await getDB();
  return db.getAll("concept_nodes");
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
