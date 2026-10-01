// Vitest setup: Dexie (used by the offline queue + local repository fallback)
// needs an indexedDB implementation when running under Node.
import "fake-indexeddb/auto";
