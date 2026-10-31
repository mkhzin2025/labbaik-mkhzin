// =====================================================================================================
// Partial indexes for the inbox "unread" and "needs reply" counts (labbaik_chats.conversations).
//
// Run by hand with mongosh, OFF-PEAK, after approval. Nothing here runs from the app: the indexes are not
// declared in conversation.schema.ts on purpose, because Mongoose autoIndex would build them on the next deploy.
//
//   Dry run (default; reads only: existing indexes, collection stats, a 2000-doc $sample):
//     mongosh "$MONGO_URL" --file backend/scripts/mongo/conversations-inbox-indexes.js
//   Build:
//     mongosh "$MONGO_URL" --eval "var APPLY=true" --file backend/scripts/mongo/conversations-inbox-indexes.js
//   Roll back (drops only the indexes this script creates):
//     mongosh "$MONGO_URL" --eval "var ROLLBACK=true" --file backend/scripts/mongo/conversations-inbox-indexes.js
//
// On the server (the database is only reachable inside Docker):
//     docker cp backend/scripts/mongo/conversations-inbox-indexes.js labbaik-mongodb:/tmp/inbox-indexes.js
//     docker exec labbaik-mongodb mongosh "mongodb://<user>:<password>@localhost:27017/labbaik_chats?authSource=admin" --file /tmp/inbox-indexes.js
//
// Why partial: only a small share of threads is unread or waiting for a reply, so each index holds just those
// rows (small to build and to keep up to date), and the counts read a few thousand index keys instead of
// fetching every thread of the branch. A query uses a partial index only when its filter implies the index's
// filter: the inbox queries always contain `unreadCount: { $gt: 0 }` / `awaitingReply: true` for these counts.
// The filters use only operators every partial-index version accepts ($gt, equality; MongoDB 3.2+, so 6.0 is fine).
// =====================================================================================================

const COLLECTION = 'conversations';
const INDEXES = [
  {
    // countInbox "unread": { storeId, status: { $nin: [...] }, unreadCount: { $gt: 0 } }. All three fields are
    // keys, so the count is answered from the index alone.
    name: 'inbox_unread_partial',
    key: { storeId: 1, status: 1, unreadCount: 1 },
    options: { partialFilterExpression: { unreadCount: { $gt: 0 } } },
  },
  {
    // countInbox "needsReply" and the needs_reply tab: { storeId, status, awaitingReply: true,
    // lastMessageAt: { $gt: now - 24h }, $or: [...] }. Bounded by branch, status and the 24h window.
    name: 'inbox_awaiting_reply_partial',
    key: { storeId: 1, status: 1, lastMessageAt: -1 },
    options: { partialFilterExpression: { awaitingReply: true } },
  },
];

const apply = typeof APPLY !== 'undefined' && APPLY === true;
const rollback = typeof ROLLBACK !== 'undefined' && ROLLBACK === true;
const coll = db.getCollection(COLLECTION);

print(`MongoDB ${db.version()} — database ${db.getName()}, collection ${COLLECTION}`);
const existing = coll.getIndexes();
print('Existing indexes:');
for (const index of existing) print(`  ${index.name}  ${JSON.stringify(index.key)}${index.partialFilterExpression ? '  partial ' + JSON.stringify(index.partialFilterExpression) : ''}`);

const stats = coll.stats({ scale: 1024 * 1024 });
print(`Documents: ${stats.count}  data: ${Math.round(stats.size)} MB  indexes: ${Math.round(stats.totalIndexSize)} MB`);

if (rollback) {
  for (const { name } of INDEXES) {
    if (!existing.some((index) => index.name === name)) { print(`skip   ${name} (not present)`); continue; }
    coll.dropIndex(name);
    print(`dropped ${name}`);
  }
  quit(0);
}

// Selectivity from a random sample (WiredTiger random cursor: does not scan the collection).
const sample = coll.aggregate([
  { $sample: { size: 2000 } },
  { $project: { _id: 0, unread: { $gt: ['$unreadCount', 0] }, awaiting: { $eq: ['$awaitingReply', true] }, status: 1 } },
], { maxTimeMS: 20000 }).toArray();
const share = (test) => (sample.length ? ((100 * sample.filter(test).length) / sample.length).toFixed(2) : '?');
print(`Sample of ${sample.length}: unread ${share((d) => d.unread)}%, awaitingReply ${share((d) => d.awaiting)}%, ` +
  `status not snoozed/closed ${share((d) => d.status !== 'snoozed' && d.status !== 'closed')}%`);
print(`Estimated entries: unread ≈ ${Math.round((stats.count * Number(share((d) => d.unread))) / 100)}, awaiting ≈ ${Math.round((stats.count * Number(share((d) => d.awaiting))) / 100)}`);

for (const { name, key, options } of INDEXES) {
  const same = existing.find((index) => index.name === name);
  if (same) { print(`exists ${name}`); continue; }
  if (!apply) { print(`would create ${name} ${JSON.stringify(key)} ${JSON.stringify(options)}`); continue; }
  const started = Date.now();
  // Standalone/replica set builds are "hybrid" (4.2+): writes continue during the build; it costs CPU and I/O
  // while it scans the collection, which is why this belongs off-peak. Progress: db.currentOp({ 'command.createIndexes': COLLECTION })
  coll.createIndex(key, { ...options, name });
  print(`created ${name} in ${Math.round((Date.now() - started) / 1000)}s`);
}
if (!apply) print('Dry run only. Re-run with --eval "var APPLY=true" to build.');
