import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

const directory = path.dirname(fileURLToPath(import.meta.url));
let replicaSet: MongoMemoryReplSet;

export async function setup(): Promise<void> {
  replicaSet = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: 'wiredTiger' },
  });
  writeFileSync(path.join(directory, '.mongo-uri'), replicaSet.getUri(), 'utf8');
}

export async function teardown(): Promise<void> {
  if (replicaSet) await replicaSet.stop();
}
