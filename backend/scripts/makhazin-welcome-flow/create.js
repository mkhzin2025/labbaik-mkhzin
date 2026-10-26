// Adds the Makhazin welcome flow (graph.js) to the main store as a STOPPED draft (isActive = false).
// It never touches existing flows; activate it from the flows page after filling the 【...】 lines.
//
// Runs inside the backend container (see ../transfer-main-to-branches/env.js).
// Dry run (default, read-only):  node scripts/makhazin-welcome-flow/create.js
// Apply:                          node scripts/makhazin-welcome-flow/create.js --apply
const { randomUUID } = require('crypto');
const { pg } = require('../transfer-main-to-branches/env');
const { build } = require('./graph');

const MAIN = '748743fe-685f-434d-ad7f-4359c9e675ed';
const NAME = 'رد ترحيبي - مخازن (عربي/English)';
const APPLY = process.argv.includes('--apply');

async function main() {
  const graph = build();
  const client = pg();
  await client.connect();
  try {
    const { rows: [store] } = await client.query('SELECT id, name, "organizationId" FROM stores WHERE id = $1', [MAIN]);
    if (!store) throw new Error(`Store ${MAIN} not found`);
    console.log(`Store: ${store.name} (${store.id})`);

    const { rows: existing } = await client.query(
      `SELECT f.id, f.name, f."isActive", s.name AS store
         FROM flows f JOIN stores s ON s.id = f."storeId"
        WHERE ${store.organizationId ? 's."organizationId" = $1' : 's.id = $1'}
        ORDER BY f."updatedAt" DESC`, [store.organizationId || store.id]);
    console.log(`\nExisting flows (${existing.length}):`);
    existing.forEach((f) => console.log(`  ${f.isActive ? '[active] ' : '[stopped]'} ${f.name}  (${f.store})`));

    const placeholders = graph.nodes.filter((n) => /【/.test(n.data?.text || '')).length;
    console.log(`\nNew flow: "${NAME}" — ${graph.nodes.length} nodes, ${graph.edges.length} edges, ${placeholders} nodes with 【...】 to fill, stopped.`);

    if (existing.some((f) => f.name === NAME)) {
      console.log('A flow with this name already exists; nothing to do (rename or delete it to add again).');
      return;
    }
    if (!APPLY) {
      console.log('\nDry run. Re-run with --apply to add it.');
      return;
    }
    const id = randomUUID();
    await client.query(
      `INSERT INTO flows (id, name, "isDefault", nodes, edges, "isActive", "storeId")
       VALUES ($1, $2, false, $3::jsonb, $4::jsonb, false, $5)`,
      [id, NAME, JSON.stringify(graph.nodes), JSON.stringify(graph.edges), store.id]);
    console.log(`\nAdded (stopped): ${id}\nOpen it at /dashboard/flows/${id}`);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
