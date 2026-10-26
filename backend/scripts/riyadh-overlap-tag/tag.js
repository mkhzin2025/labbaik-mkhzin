// Tags customers whose number exists in two or more Riyadh branches with the organization tag "متداخل الرياض".
// Every record of such a number in those branches gets the tag, so it shows in each branch's customer list and
// can be used as a campaign segment (include it to reach them once, or exclude it per branch).
//
// Read-only unless --apply. Safe to re-run: the tag is reused and links use ON CONFLICT DO NOTHING.
// The journal of added links is the rollback data; copy it out of the container after an apply.
//
// Dry run (default):  node scripts/riyadh-overlap-tag/tag.js
// Apply:              node scripts/riyadh-overlap-tag/tag.js --apply
// Roll back:          node scripts/riyadh-overlap-tag/tag.js --rollback=<journal file>
const fs = require('fs');
const path = require('path');
const { pg } = require('../transfer-main-to-branches/env');

const JOURNAL_DIR = process.env.JOURNAL_DIR || '/tmp/transfer-journals';
// Any branch of the mkhzin organization; used only to find the organization.
const MAIN = '748743fe-685f-434d-ad7f-4359c9e675ed';
const TAG_NAME = 'متداخل الرياض';
const TAG_COLOR = '#ea580c';
const RIYADH = ['طويق', 'الجنادرية', 'الشفاء', 'الربوة', 'المونسية', 'الخليج'];

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const [k, ...v] = a.replace(/^--/, '').split('=');
  return [k, v.length ? v.join('=') : true];
}));

// Same digit normalization as the transfer script / CustomersService.
const PHONE_SQL = `REGEXP_REPLACE(COALESCE(c."phoneNumber", c."whatsappId", ''), '[^0-9]', '', 'g')`;
const normalize = (value) => {
  let d = String(value ?? '').replace(/[^0-9]/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('9660')) d = `966${d.slice(4)}`;
  if (d.length === 10 && d.startsWith('05')) return `966${d.slice(1)}`;
  if (d.length === 9 && d.startsWith('5')) return `966${d}`;
  return d;
};
// "فرع المؤنسية" and "المونسيه" both become "المونسيه".
const clean = (text) => String(text || '')
  .replace(/[^\p{L}\s]/gu, ' ')
  .replace(/[أإآ]/g, 'ا').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي').replace(/ى/g, 'ي').replace(/ة/g, 'ه')
  .replace(/^\s*فرع\s+(حي\s+)?/, '')
  .replace(/\s+/g, ' ').trim();

async function rollback(client, file) {
  const { tagId, created, customerIds } = JSON.parse(fs.readFileSync(file, 'utf8'));
  await client.query('BEGIN');
  const { rowCount } = await client.query('DELETE FROM customer_tag_links WHERE "tagId" = $1 AND "customerId" = ANY($2::uuid[])', [tagId, customerIds]);
  if (created) await client.query('DELETE FROM customer_tags t WHERE id = $1 AND NOT EXISTS (SELECT 1 FROM customer_tag_links l WHERE l."tagId" = t.id)', [tagId]);
  await client.query('COMMIT');
  console.log(`Removed ${rowCount} links${created ? ' and the tag (if no other links remained)' : ''}.`);
}

async function main() {
  const client = pg();
  await client.connect();
  try {
    if (args.rollback) return await rollback(client, args.rollback);

    const { rows: [anchor] } = await client.query('SELECT "organizationId" FROM stores WHERE id = $1', [MAIN]);
    if (!anchor) throw new Error('Anchor branch not found');
    const organizationId = anchor.organizationId;
    const { rows: stores } = await client.query('SELECT id, name FROM stores WHERE "organizationId" = $1', [organizationId]);

    const branches = RIYADH.map((wanted) => {
      const matches = stores.filter((s) => clean(s.name) === clean(wanted));
      if (matches.length !== 1) {
        console.log('Organization branches:', stores.map((s) => s.name).join(' | '));
        throw new Error(`Branch "${wanted}" matched ${matches.length} stores; fix RIYADH names`);
      }
      return matches[0];
    });
    const storeIds = branches.map((b) => b.id);
    const nameOf = Object.fromEntries(branches.map((b) => [b.id, b.name]));
    console.log('Branches:', branches.map((b) => b.name).join(' | '));

    const { rows: customers } = await client.query(
      `SELECT c.id, c."storeId", ${PHONE_SQL} AS phone FROM customers c WHERE c."storeId" = ANY($1::uuid[])`, [storeIds]);

    const byPhone = new Map();
    for (const c of customers) {
      const phone = normalize(c.phone);
      if (phone.length < 9) continue;
      if (!byPhone.has(phone)) byPhone.set(phone, []);
      byPhone.get(phone).push(c);
    }
    const overlapping = [...byPhone.values()].filter((list) => new Set(list.map((c) => c.storeId)).size >= 2);
    const customerIds = overlapping.flat().map((c) => c.id);

    console.log(`\nCustomers in these branches: ${customers.length}, distinct numbers: ${byPhone.size}`);
    console.log(`Numbers in 2+ branches: ${overlapping.length}  ->  records to tag: ${customerIds.length}`);
    const spread = {};
    for (const list of overlapping) spread[new Set(list.map((c) => c.storeId)).size] = (spread[new Set(list.map((c) => c.storeId)).size] || 0) + 1;
    Object.entries(spread).forEach(([n, count]) => console.log(`  in ${n} branches: ${count} numbers`));
    const perBranch = {};
    for (const c of overlapping.flat()) perBranch[nameOf[c.storeId]] = (perBranch[nameOf[c.storeId]] || 0) + 1;
    Object.entries(perBranch).forEach(([name, count]) => console.log(`  ${name}: ${count} tagged records`));

    const { rows: [existing] } = await client.query(
      `SELECT id FROM customer_tags WHERE "organizationId" = $1 AND scope = 'organization' AND TRIM(name) = $2`, [organizationId, TAG_NAME]);
    console.log(`\nTag "${TAG_NAME}": ${existing ? 'exists, will be reused' : 'will be created at organization scope'}`);

    if (!args.apply) {
      console.log('\nDry run only. Re-run with --apply to write.');
      return;
    }

    await client.query('BEGIN');
    let tagId = existing?.id;
    if (!tagId) {
      ({ rows: [{ id: tagId }] } = await client.query(
        `INSERT INTO customer_tags ("organizationId", scope, "storeId", name, color, "isActive")
         VALUES ($1, 'organization', NULL, $2, $3, true) RETURNING id`, [organizationId, TAG_NAME, TAG_COLOR]));
    }
    const { rows: added } = customerIds.length ? await client.query(
      `INSERT INTO customer_tag_links ("customerId", "tagId") SELECT unnest($1::uuid[]), $2 ON CONFLICT DO NOTHING RETURNING "customerId"`,
      [customerIds, tagId]) : { rows: [] };
    await client.query('COMMIT');

    fs.mkdirSync(JOURNAL_DIR, { recursive: true });
    const file = path.join(JOURNAL_DIR, `riyadh-overlap-tag-${Date.now()}.json`);
    fs.writeFileSync(file, JSON.stringify({ tagId, created: !existing, customerIds: added.map((r) => r.customerId) }));
    console.log(`\nLinked ${added.length} new records (others already had the tag). Journal: ${file}`);
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
