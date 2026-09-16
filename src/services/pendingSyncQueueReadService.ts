import Dexie from 'dexie';
import { db } from '@/lib/db';

export const readPendingSyncQueueBatch = (limit: number) => db.syncQueue
  .where('[status+queue_priority+created_at+id]')
  .between(['pending', Dexie.minKey, Dexie.minKey, Dexie.minKey], ['pending', Dexie.maxKey, Dexie.maxKey, Dexie.maxKey])
  .limit(Math.max(0, Math.floor(limit)))
  .toArray();
