import { randomUUID } from "node:crypto";

const BACKUP_PREFIX = "competition-backups/";
const BACKUP_LIMIT = 20;

export async function backupCompetitionData(store, current) {
  if (!current?.participants) return;
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  await store.setJSON(`${BACKUP_PREFIX}${timestamp}-${current.revision || randomUUID()}`, current);
  try {
    const result = await store.list({ prefix: BACKUP_PREFIX });
    const stale = (result.blobs || [])
      .map((entry) => entry.key)
      .sort()
      .reverse()
      .slice(BACKUP_LIMIT);
    await Promise.all(stale.map((key) => store.delete(key)));
  } catch (error) {
    console.warn("Kunne ikke rydde gamle konkurransebackuper:", error.message);
  }
}
