import { db } from "./db";

function cacheId(userId: string, kind: string, key: string): string {
  return `${userId}:${kind}:${key}`;
}

export async function saveCloudCache<T>(userId: string, kind: string, key: string, value: T): Promise<void> {
  await db.cloudCache.put({
    id: cacheId(userId, kind, key),
    userId,
    kind,
    value,
    updatedAt: Date.now(),
  });
}

export async function deleteCloudCacheEntry(userId: string, kind: string, key: string): Promise<void> {
  await db.cloudCache.delete(cacheId(userId, kind, key));
}

export async function readCloudCache<T>(userId: string, kind: string, key: string): Promise<T | undefined> {
  const row = await db.cloudCache.get(cacheId(userId, kind, key));
  return row?.value as T | undefined;
}

export async function listCloudCache<T>(userId: string, kind: string): Promise<Array<{ id: string; value: T }>> {
  const rows = await db.cloudCache.where("[userId+kind]").equals([userId, kind]).toArray();
  return rows.map((row) => ({ id: row.id, value: row.value as T }));
}

export async function deleteCloudCache(userId: string): Promise<void> {
  await db.cloudCache.where("userId").equals(userId).delete();
}
