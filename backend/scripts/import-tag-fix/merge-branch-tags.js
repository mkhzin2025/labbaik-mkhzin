// Merges the per-branch copies of a tag (one store-scoped tag per branch, same name) into one
// organization-wide tag, so the tag lists and reports show it once.
// Every customer keeps the tag: its link moves to the organization tag, then the branch copies are deleted.
//
// Read-only unless --apply. Runs in one transaction. The journal holds every moved link for rollback.
//
// Dry run (default):  node scripts/import-tag-fix/merge-branch-tags.js --tag="نقاط البيع 11-2026"
// Apply:              node scripts/import-tag-fix/merge-branch-tags.js --tag="نقاط البيع 11-2026" --apply
// Roll back:          node scripts/import-tag-fix/merge-branch-tags.js --rollback=<journal file>
const fs = require('fs');
const path = require('path');
const { pg } = require('../transfer-main-to-branches/env');

const JOURNAL_DIR = process.env.JOURNAL_DIR || '/tmp/transfer-journals';
// Any branch of the mkhzin organization; used only to find the organization.
const ANCHOR = '748743fe-685f-434d-ad7f-4359c9e675ed';

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const [k, ...v] = a.replace(/^--/, '').split('=');
  return [k, v.length ? v.join('=') : true];
}));

async function rollback(client, file) {
  const { organizationTag, createdOrganizationTag, branchTags } = JSON.parse(fs.readFileSync(file, 'utf8'));
  await client.query('BEGIN');
  for (const tag of branchTags) {
    await client.query(
      `INSERT INTO customer_tags (id, "organizationId", scope, "storeId", name, color, "isActive", "createdAt", "updatedAt")
       VALUES ($1, $2, 'store', $3, $4, $5, $6, $7, now()) ON CONFLICT (id) DO NOTHING`,
      [tag.id, tag.organizationId, tag.storeId, tag.name, tag.color, tag.isActive, tag.createdAt],
    );
    await client.query(
      'INSERT INTO customer_tag_links ("customerId", "tagId") SELECT unnest($1::uuid[]), $2 ON CONFLICT DO NOTHING',
      [tag.customerIds, tag.id],
    );
  }
  if (createdOrganizationTag) await client.query('DELETE FROM customer_tags WHERE id = $1', [organizationTag.id]);
  else {
    // Only the links the merge added; customers who already had the organization tag keep it.
    await client.query(
      'DELETE FROM customer_tag_links WHERE "tagId" = $1 AND "customerId" = ANY($2::uuid[]) AND NOT ("customerId" = ANY($3::uuid[]))',
      [organizationTag.id, branchTags.flatMap((tag) => tag.customerIds), organizationTag.previousCustomerIds || []],
    );
  }
  await client.query('COMMIT');
  console.log(`Restored ${branchTags.length} branch tags.`);
}

async function main() {
  const client = pg();
  await client.connect();
  try {
    if (args.rollback) return await rollback(client, args.rollback);
    if (!args.tag) throw new Error('Pass --tag=<tag name>');
    const name = String(args.tag).trim();

    const { rows: [anchor] } = await client.query('SELECT "organizationId" FROM stores WHERE id = $1', [ANCHOR]);
    if (!anchor) throw new Error('Anchor branch not found');
    const organizationId = anchor.organizationId;

    const { rows: branchTags } = await client.query(
      `SELECT t.id, t."organizationId", t."storeId", t.name, t.color, t."isActive", t."createdAt", s.name AS branch,
              COUNT(l."customerId")::int AS customers
         FROM customer_tags t
         LEFT JOIN stores s ON s.id = t."storeId"
         LEFT JOIN customer_tag_links l ON l."tagId" = t.id
        WHERE t."organizationId" = $1 AND t.scope = 'store' AND TRIM(t.name) = $2
        GROUP BY t.id, s.name ORDER BY s.name`,
      [organizationId, name],
    );
    const { rows: [orgTag] } = await client.query(
      `SELECT t.id, t.name, t.color, (SELECT COUNT(*)::int FROM customer_tag_links l WHERE l."tagId" = t.id) AS customers
         FROM customer_tags t WHERE t."organizationId" = $1 AND t.scope = 'organization' AND TRIM(t.name) = $2`,
      [organizationId, name],
    );

    console.log(`Tag: ${name}`);
    console.log(`Branch copies: ${branchTags.length}`);
    for (const t of branchTags) console.log(`  ${t.branch}: ${t.customers}`);
    const total = branchTags.reduce((sum, t) => sum + t.customers, 0);
    console.log(`Total links to move: ${total}`);
    console.log(orgTag
      ? `Organization tag exists (${orgTag.customers} customers); links will be added to it.`
      : 'Organization tag will be created.');

    if (!branchTags.length) return console.log('\nNothing to merge.');
    if (!args.apply) return console.log('\nDry run. Re-run with --apply to merge.');

    // Journal first: everything needed to rebuild the branch tags and their links.
    const branchIds = branchTags.map((t) => t.id);
    const { rows: links } = await client.query(
      'SELECT "tagId", "customerId" FROM customer_tag_links WHERE "tagId" = ANY($1::uuid[])', [branchIds]);
    const customersByTag = {};
    for (const l of links) (customersByTag[l.tagId] ||= []).push(l.customerId);
    const previousCustomerIds = orgTag
      ? (await client.query('SELECT "customerId" FROM customer_tag_links WHERE "tagId" = $1', [orgTag.id])).rows.map((r) => r.customerId)
      : [];

    await client.query('BEGIN');
    let organizationTag = orgTag;
    if (!organizationTag) {
      const { rows: [created] } = await client.query(
        `INSERT INTO customer_tags ("organizationId", scope, "storeId", name, color, "isActive")
         VALUES ($1, 'organization', NULL, $2, $3, true) RETURNING id, name, color`,
        [organizationId, name, branchTags[0].color],
      );
      organizationTag = created;
    }

    fs.mkdirSync(JOURNAL_DIR, { recursive: true });
    const journal = path.join(JOURNAL_DIR, `merge-branch-tags-${Date.now()}.json`);
    fs.writeFileSync(journal, JSON.stringify({
      organizationTag: { id: organizationTag.id, previousCustomerIds },
      createdOrganizationTag: !orgTag,
      branchTags: branchTags.map((t) => ({ ...t, customerIds: customersByTag[t.id] || [] })),
    }));

    const { rowCount: added } = await client.query(
      `INSERT INTO customer_tag_links ("customerId", "tagId")
       SELECT DISTINCT "customerId", $1::uuid FROM customer_tag_links WHERE "tagId" = ANY($2::uuid[])
       ON CONFLICT DO NOTHING`,
      [organizationTag.id, branchIds],
    );
    // The live foreign key does not cascade, so the branch links go first.
    await client.query('DELETE FROM customer_tag_links WHERE "tagId" = ANY($1::uuid[])', [branchIds]);
    const { rowCount: deleted } = await client.query('DELETE FROM customer_tags WHERE id = ANY($1::uuid[])', [branchIds]);
    await client.query('COMMIT');

    const { rows: [{ count }] } = await client.query(
      'SELECT COUNT(*)::int AS count FROM customer_tag_links WHERE "tagId" = $1', [organizationTag.id]);
    console.log(`\nAdded ${added} links to the organization tag, deleted ${deleted} branch copies.`);
    console.log(`"${name}" now has ${count} customers. Journal: ${journal}`);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
