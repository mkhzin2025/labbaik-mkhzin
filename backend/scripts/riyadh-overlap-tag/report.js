// Read-only: how the "متداخل الرياض" numbers overlap, per branch pair and per exact branch combination.
// node scripts/riyadh-overlap-tag/report.js
const { pg } = require('../transfer-main-to-branches/env');

const MAIN = '748743fe-685f-434d-ad7f-4359c9e675ed';
const TAG_NAME = 'متداخل الرياض';
const PHONE_SQL = `REGEXP_REPLACE(COALESCE(c."phoneNumber", c."whatsappId", ''), '[^0-9]', '', 'g')`;
const normalize = (value) => {
  let d = String(value ?? '').replace(/[^0-9]/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('9660')) d = `966${d.slice(4)}`;
  if (d.length === 10 && d.startsWith('05')) return `966${d.slice(1)}`;
  if (d.length === 9 && d.startsWith('5')) return `966${d}`;
  return d;
};

async function main() {
  const client = pg();
  await client.connect();
  try {
    const { rows } = await client.query(
      `SELECT s.name AS branch, ${PHONE_SQL} AS phone
         FROM customer_tag_links l
         JOIN customer_tags t ON t.id = l."tagId"
         JOIN customers c ON c.id = l."customerId"
         JOIN stores s ON s.id = c."storeId"
        WHERE t."organizationId" = (SELECT "organizationId" FROM stores WHERE id = $1)
          AND t.scope = 'organization' AND TRIM(t.name) = $2`, [MAIN, TAG_NAME]);

    const byPhone = new Map();
    for (const r of rows) {
      const phone = normalize(r.phone);
      if (!byPhone.has(phone)) byPhone.set(phone, new Set());
      byPhone.get(phone).add(r.branch);
    }
    const branches = [...new Set(rows.map((r) => r.branch))].sort();
    console.log(`Tagged records: ${rows.length}, distinct numbers: ${byPhone.size}\n`);

    console.log('Per branch (customers of the branch that also exist in another branch):');
    for (const b of branches) console.log(`  ${b}: ${[...byPhone.values()].filter((set) => set.has(b)).length}`);

    console.log('\nShared numbers per branch pair:');
    const pairs = [];
    for (let i = 0; i < branches.length; i += 1) {
      for (let j = i + 1; j < branches.length; j += 1) {
        const count = [...byPhone.values()].filter((set) => set.has(branches[i]) && set.has(branches[j])).length;
        pairs.push([`${branches[i]} + ${branches[j]}`, count]);
      }
    }
    pairs.sort((a, b) => b[1] - a[1]).forEach(([pair, count]) => console.log(`  ${pair}: ${count}`));

    console.log('\nExact branch combinations:');
    const combos = {};
    for (const set of byPhone.values()) {
      const key = [...set].sort().join(' + ');
      combos[key] = (combos[key] || 0) + 1;
    }
    Object.entries(combos).sort((a, b) => b[1] - a[1]).forEach(([combo, count]) => console.log(`  ${combo}: ${count}`));
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
