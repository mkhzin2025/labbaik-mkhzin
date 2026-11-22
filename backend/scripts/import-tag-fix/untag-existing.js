// Removes an import tag from customers who already existed in a branch before the import.
// An earlier import linked the chosen tag to every number in the file, including old customers;
// only the numbers the import created should carry it.
//
// "Existing" = created before the import started. The import start is taken as the earliest updatedAt
// among the branch's tagged customers (the import touched every one of them), minus a 5-minute margin.
// Override it with --before="2026-11-22T09:00:00+03:00" if the dry run shows the wrong split.
//
// Read-only unless --apply. The journal of removed links is the rollback data.
//
// Dry run (default):  node scripts/import-tag-fix/untag-existing.js --branch=تبوك --tag="نقاط البيع 2026-11"
// Apply:              node scripts/import-tag-fix/untag-existing.js --branch=تبوك --tag="نقاط البيع 2026-11" --apply
// Roll back:          node scripts/import-tag-fix/untag-existing.js --rollback=<journal file>
const fs = require('fs');
const path = require('path');
const { pg } = require('../transfer-main-to-branches/env');

const JOURNAL_DIR = process.env.JOURNAL_DIR || '/tmp/transfer-journals';
// Any branch of the mkhzin organization; used only to find the organization.
const ANCHOR = '748743fe-685f-434d-ad7f-4359c9e675ed';
const MARGIN_MS = 5 * 60 * 1000;

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const [k, ...v] = a.replace(/^--/, '').split('=');
  return [k, v.length ? v.join('=') : true];
}));

// "فرع تبوك" and "تبوك" match; ة/ه and alef forms are ignored.
const clean = (text) => String(text || '')
  .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
  .replace(/[أإآ]/g, 'ا').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي').replace(/ى/g, 'ي').replace(/ة/g, 'ه')
  .replace(/^\s*فرع\s+(حي\s+)?/, '')
  .replace(/\s+/g, ' ').trim();

const day = (date) => new Date(date).toISOString().slice(0, 10);
const histogram = (rows) => {
  const counts = {};
  for (const r of rows) counts[day(r.createdAt)] = (counts[day(r.createdAt)] || 0) + 1;
  return Object.entries(counts).sort().map(([d, n]) => `    ${d}: ${n}`).join('\n') || '    (none)';
};

async function rollback(client, file) {
  const { tagId, customerIds } = JSON.parse(fs.readFileSync(file, 'utf8'));
  const { rowCount } = await client.query(
    'INSERT INTO customer_tag_links ("customerId", "tagId") SELECT unnest($1::uuid[]), $2 ON CONFLICT DO NOTHING',
    [customerIds, tagId],
  );
  console.log(`Restored ${rowCount} links.`);
}

async function main() {
  const client = pg();
  await client.connect();
  try {
    if (args.rollback) return await rollback(client, args.rollback);
    if (!args.branch || !args.tag) throw new Error('Pass --branch=<branch name> and --tag=<tag name>');

    const { rows: [anchor] } = await client.query('SELECT "organizationId" FROM stores WHERE id = $1', [ANCHOR]);
    if (!anchor) throw new Error('Anchor branch not found');
    const organizationId = anchor.organizationId;

    const { rows: stores } = await client.query('SELECT id, name FROM stores WHERE "organizationId" = $1', [organizationId]);
    const branches = stores.filter((s) => clean(s.name) === clean(args.branch));
    if (branches.length !== 1) {
      console.log('Organization branches:', stores.map((s) => s.name).join(' | '));
      throw new Error(`Branch "${args.branch}" matched ${branches.length} stores`);
    }
    const branch = branches[0];

    // The tag as the branch sees it: its own branch tag or an organization-wide one.
    const { rows: tags } = await client.query(
      `SELECT id, name, scope FROM customer_tags
        WHERE "organizationId" = $1 AND TRIM(name) = $2
          AND (("scope" = 'store' AND "storeId" = $3) OR "scope" = 'organization')`,
      [organizationId, String(args.tag).trim(), branch.id],
    );
    if (tags.length !== 1) throw new Error(`Tag "${args.tag}" matched ${tags.length} tags for ${branch.name}`);
    const tag = tags[0];

    const { rows: tagged } = await client.query(
      `SELECT c.id, c."createdAt", c."updatedAt"
         FROM customer_tag_links l JOIN customers c ON c.id = l."customerId"
        WHERE l."tagId" = $1 AND c."storeId" = $2`,
      [tag.id, branch.id],
    );
    if (!tagged.length) return console.log(`No ${branch.name} customers carry "${tag.name}". Nothing to do.`);

    const cutoff = args.before
      ? new Date(args.before)
      : new Date(tagged.reduce((min, r) => Math.min(min, new Date(r.updatedAt).getTime()), Infinity) - MARGIN_MS);
    if (Number.isNaN(cutoff.getTime())) throw new Error(`Invalid --before: ${args.before}`);

    const remove = tagged.filter((r) => new Date(r.createdAt) < cutoff);
    const keep = tagged.filter((r) => new Date(r.createdAt) >= cutoff);

    console.log(`Branch: ${branch.name}  Tag: ${tag.name} (${tag.scope})`);
    console.log(`Import cutoff: ${cutoff.toISOString()}${args.before ? ' (from --before)' : ' (auto)'}`);
    console.log(`Tagged in branch: ${tagged.length}`);
    console.log(`  Keep (created by the import): ${keep.length}\n${histogram(keep)}`);
    console.log(`  Remove (existed before):      ${remove.length}\n${histogram(remove)}`);

    if (!args.apply) return console.log('\nDry run. Re-run with --apply to remove the tag from the existing customers.');
    if (!remove.length) return console.log('\nNothing to remove.');

    fs.mkdirSync(JOURNAL_DIR, { recursive: true });
    const journal = path.join(JOURNAL_DIR, `untag-existing-${branch.id}-${Date.now()}.json`);
    const customerIds = remove.map((r) => r.id);
    fs.writeFileSync(journal, JSON.stringify({ tagId: tag.id, branchId: branch.id, cutoff, customerIds }));

    const { rowCount } = await client.query(
      'DELETE FROM customer_tag_links WHERE "tagId" = $1 AND "customerId" = ANY($2::uuid[])',
      [tag.id, customerIds],
    );
    console.log(`\nRemoved ${rowCount} links. Journal: ${journal}`);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
