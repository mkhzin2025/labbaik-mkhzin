// =====================================================================================================
// Closes inbox conversations with no activity for DAYS days (labbaik_chats.conversations), once, by hand.
//
// Why: the inbox splits into "open" (nobody took it), "mine" (what I handle) and "closed". Years of threads were
// never closed, so without this every member's "mine" would start with thousands of dead conversations.
//
// What it does NOT do: send the customer the rating message (that only happens when the team closes from the
// inbox), credit anyone with a close (closedById / closures stay untouched, so reports and the satisfaction chart
// don't move), or touch who handles the thread (agentId). A customer writing again reopens the thread as usual.
// Each closed thread keeps its previous state in `bulkClosed`, which is what the rollback restores.
//
// Run with mongosh, OFF-PEAK, after approval:
//   Dry run (default; reads only):
//     mongosh "$MONGO_URL" --file backend/scripts/mongo/close-stale-conversations.js
//   Apply (DAYS defaults to 7):
//     mongosh "$MONGO_URL" --eval "var APPLY=true; var DAYS=7" --file backend/scripts/mongo/close-stale-conversations.js
//   Roll back one run (RUN = the run id the apply printed); threads that were reopened since are left alone:
//     mongosh "$MONGO_URL" --eval "var ROLLBACK='<run id>'" --file backend/scripts/mongo/close-stale-conversations.js
//
// On the server (the database is only reachable inside Docker):
//     docker cp backend/scripts/mongo/close-stale-conversations.js labbaik-mongodb:/tmp/close-stale.js
//     docker exec labbaik-mongodb mongosh "mongodb://<user>:<password>@localhost:27017/labbaik_chats?authSource=admin" \
//       --eval "var APPLY=true" --file /tmp/close-stale.js
// =====================================================================================================

const COLLECTION = 'conversations';
const BATCH = 5000;
const days = typeof DAYS !== 'undefined' ? Number(DAYS) : 7;
const apply = typeof APPLY !== 'undefined' && APPLY === true;
const rollback = typeof ROLLBACK !== 'undefined' ? String(ROLLBACK) : null;
const coll = db.getCollection(COLLECTION);

if (!(days >= 1)) { print('DAYS must be 1 or more.'); quit(1); }
print(`MongoDB ${db.version()} — database ${db.getName()}, collection ${COLLECTION}`);

if (rollback) {
  const result = coll.updateMany(
    { 'bulkClosed.run': rollback, status: 'closed' },
    [
      { $set: { status: '$bulkClosed.status', unreadCount: '$bulkClosed.unreadCount', awaitingReply: '$bulkClosed.awaitingReply', snoozedUntil: '$bulkClosed.snoozedUntil' } },
      { $unset: 'bulkClosed' },
    ],
  );
  print(`Restored ${result.modifiedCount} conversations of run ${rollback}.`);
  quit(0);
}

const cutoff = new Date(Date.now() - days * 86400000);
const filter = { status: { $ne: 'closed' }, lastMessageAt: { $lt: cutoff } };
print(`Not closed and no activity since ${cutoff.toISOString()} (${days} days):`);
const byStatus = coll.aggregate([
  { $match: filter },
  { $group: { _id: { status: '$status', assigned: { $ne: [{ $ifNull: ['$agentId', null] }, null] } }, n: { $sum: 1 } } },
  { $sort: { n: -1 } },
], { allowDiskUse: true }).toArray();
let total = 0;
for (const row of byStatus) {
  total += row.n;
  print(`  status ${row._id.status || '(none)'}  ${row._id.assigned ? 'assigned' : 'unassigned'}: ${row.n}`);
}
print(`Total to close: ${total}`);
const keep = coll.countDocuments({ status: { $ne: 'closed' }, lastMessageAt: { $gte: cutoff } });
print(`Stay open (active in the last ${days} days): ${keep}`);

if (!apply) {
  print('Dry run only. Re-run with --eval "var APPLY=true" to close them.');
  quit(0);
}

const run = new Date().toISOString();
const now = new Date();
let closed = 0;
for (;;) {
  const ids = coll.find(filter, { _id: 1 }).limit(BATCH).toArray().map((doc) => doc._id);
  if (!ids.length) break;
  const result = coll.updateMany({ _id: { $in: ids }, ...filter }, [
    {
      $set: {
        bulkClosed: { run, at: now, status: '$status', unreadCount: '$unreadCount', awaitingReply: '$awaitingReply', snoozedUntil: '$snoozedUntil' },
        status: 'closed',
        statusUpdatedAt: now,
        snoozedUntil: null,
        unreadCount: 0,
        awaitingReply: false,
      },
    },
  ]);
  closed += result.modifiedCount;
  print(`  closed ${closed} / ${total}`);
}
print(`Done: closed ${closed}. Run id (for ROLLBACK): ${run}`);
