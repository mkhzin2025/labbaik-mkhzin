// Moves WhatsApp customers of "الفرع الرئيسي" to the branch they picked in the bot, and links every
// main-branch WhatsApp customer to the organization category "tael-bot".
// Mirrors CustomersService.transferToStore + ConversationsService.transferCustomer:
//   - no record in the target branch  -> the customer and their conversation move there
//   - a record already in the target  -> merged into it (names only fill placeholders), conversations merged
//   - kept record gets updatedAt = now, so inbound WhatsApp routing follows it to the new branch
//
// Safe to interrupt and re-run: each customer is committed on its own and linked to tael-bot in the same
// transaction, conversations left behind by an interrupted customer are repaired on the next run, merges
// de-duplicate messages, and customers moved by earlier runs (journals in this folder) get their tael-bot link.
//
// Runs inside the backend container (see env.js). Journals go to JOURNAL_DIR (default /tmp/transfer-journals);
// copy them out of the container after an apply, they are the rollback data.
//
// Dry run (default, read-only):  node scripts/transfer-main-to-branches/transfer.js
// Apply:                          node scripts/transfer-main-to-branches/transfer.js --apply
// Roll back (newest file first):  node scripts/transfer-main-to-branches/transfer.js --rollback=<journal file>
const fs = require('fs');
const path = require('path');
const { pg, mongo, EJSON } = require('./env');

const JOURNAL_DIR = process.env.JOURNAL_DIR || '/tmp/transfer-journals';
// Customers moved by the first, interrupted run (from its journal); they still need the tael-bot link.
const EARLIER_KEPT_IDS = require('./earlier-kept-ids.json');

const MAIN = '748743fe-685f-434d-ad7f-4359c9e675ed';
const CATEGORY_NAME = 'tael-bot';
const CATEGORY_COLOR = '#16a34a';

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const [k, ...v] = a.replace(/^--/, '').split('=');
  return [k, v.length ? v.join('=') : true];
}));
const APPLY = !!args.apply;

const normalize = (value) => {
  let d = String(value ?? '').replace(/[^0-9]/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('9660')) d = `966${d.slice(4)}`;
  if (d.length === 10 && d.startsWith('05')) return `966${d.slice(1)}`;
  if (d.length === 9 && d.startsWith('5')) return `966${d}`;
  return d;
};
const isPlaceholderName = (name, identifier) => {
  const value = String(name || '').trim();
  if (!value) return true;
  if (/^(WhatsApp|العميل|عميل)\s/.test(value)) return true;
  const digits = value.replace(/[^0-9]/g, '');
  return !!identifier && digits.length > 5 && digits === String(identifier).replace(/[^0-9]/g, '');
};
const letters = (text) => String(text || '').replace(/[^\p{L}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
const isFromCustomer = (m) => m.from !== 'me' && m.from !== 'system' && m.type !== 'system_error';
const PHONE_SQL = `REGEXP_REPLACE(COALESCE(c."phoneNumber", c."whatsappId", ''), '[^0-9]', '', 'g')`;

// "عروض <region>" only identifies a branch when the region has exactly one (Riyadh and Jeddah have several).
const OFFER_REGIONS = { 'تبوك': 'تبوك', 'القصيم': 'بريدة', 'حفر الباطن': 'حفر الباطن' };

/**
 * Latest branch the customer picked, by strength: "فرع [حي] X" menu reply > bare "X" > "عروض <single-branch region>".
 * Free text that merely mentions a city ("وظائف في تبوك") is ignored.
 */
function pickBranch(messages, branches) {
  const customer = (messages || []).filter(isFromCustomer).sort((a, b) => (Number(b.timestamp) || 0) - (Number(a.timestamp) || 0));
  let bare = null;
  let offers = null;
  for (const m of customer) {
    const text = letters(m.text).replace(/^فرع\s*حي\s*/, 'فرع ');
    for (const b of branches) {
      if (text === `فرع ${b.clean}` || text === `فرع${b.clean}`) return { store: b, how: 'فرع X' };
      if (!bare && text === b.clean) bare = { store: b, how: 'X' };
    }
    if (!offers) {
      const region = Object.keys(OFFER_REGIONS).find((r) => text === `عروض ${r}`);
      const store = region && branches.find((b) => b.clean === OFFER_REGIONS[region]);
      if (store) offers = { store, how: 'عروض' };
    }
  }
  return bare || offers;
}

// EJSON keeps ObjectIds and Dates intact so conversations can be restored byte-for-byte.
const journalLine = (file, entry) => fs.appendFileSync(file, `${EJSON.stringify(entry, { relaxed: false })}\n`);
const readJournal = (file) => fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => EJSON.parse(l, { relaxed: false }));

/** Same as ConversationsService.transferCustomer, plus message de-duplication so a re-run never doubles a thread. */
async function moveConversations(col, query, targetStoreId, keptId) {
  const log = [];
  for (const source of await col.find(query).toArray()) {
    const target = await col.findOne({ _id: { $ne: source._id }, storeId: targetStoreId, platform: source.platform, customerPhone: source.customerPhone });
    if (!target) {
      await col.updateOne({ _id: source._id }, { $set: { storeId: targetStoreId, customerId: keptId } });
      log.push({ sourceId: source._id, sourceBefore: { storeId: source.storeId, customerId: source.customerId } });
      continue;
    }
    const seen = new Set();
    const messages = [...(target.messages || []), ...(source.messages || [])]
      .filter((m) => {
        const key = String(m._id || m.metadata?.whatsappMessageId || `${m.timestamp}|${m.from}|${m.text}`);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => (Number(a.timestamp) || 0) - (Number(b.timestamp) || 0));
    const latest = [target, source].sort((a, b) => new Date(b.lastMessageAt || 0) - new Date(a.lastMessageAt || 0))[0];
    await col.updateOne({ _id: target._id }, {
      $set: {
        messages,
        customerId: keptId,
        unreadCount: (target.unreadCount || 0) + (source.unreadCount || 0),
        tags: [...new Set([...(target.tags || []), ...(source.tags || [])])],
        lastMessage: latest.lastMessage,
        lastMessageAt: latest.lastMessageAt,
        awaitingReply: latest.awaitingReply,
        status: latest.status,
        snoozedUntil: latest.snoozedUntil,
        metaConnectionId: target.metaConnectionId || source.metaConnectionId,
      },
    });
    await col.deleteOne({ _id: source._id });
    log.push({ sourceId: source._id, targetBefore: target, mergedSource: source });
  }
  return log;
}

async function restoreConversations(col, conversations) {
  for (const c of [...conversations].reverse()) {
    if (c.targetBefore) await col.replaceOne({ _id: c.targetBefore._id }, c.targetBefore);
    if (c.mergedSource) await col.replaceOne({ _id: c.mergedSource._id }, c.mergedSource, { upsert: true });
    else if (c.sourceBefore) await col.updateOne({ _id: c.sourceId }, { $set: c.sourceBefore });
  }
}

async function rollback(client, db, file) {
  const col = db.collection('conversations');
  let n = 0;
  for (const e of readJournal(file).reverse()) {
    if (e.kind === 'category') {
      if (e.customerIds.length) await client.query('DELETE FROM customer_category_links WHERE "categoryId" = $1 AND "customerId" = ANY($2::uuid[])', [e.categoryId, e.customerIds]);
      if (e.created) await client.query('DELETE FROM customer_categories c WHERE id = $1 AND NOT EXISTS (SELECT 1 FROM customer_category_links l WHERE l."categoryId" = c.id)', [e.categoryId]);
      continue;
    }
    if (e.kind === 'repair') {
      if (e.taelBotLinked) await client.query('DELETE FROM customer_category_links WHERE "categoryId" = $1 AND "customerId" = $2', [e.categoryId, e.keptId]);
      await restoreConversations(col, e.conversations);
      continue;
    }
    await client.query('BEGIN');
    try {
      if (e.taelBotLinked) await client.query('DELETE FROM customer_category_links WHERE "categoryId" = $1 AND "customerId" = $2', [e.categoryId, e.keptId]);
      if (e.mode === 'move') {
        await client.query('UPDATE customers SET "storeId" = $2, "updatedAt" = $3 WHERE id = $1', [e.source.id, e.source.storeId, e.source.updatedAt]);
      } else {
        await client.query('DELETE FROM customer_category_links WHERE "customerId" = $1 AND NOT ("categoryId" = ANY($2::uuid[]))', [e.target.id, e.targetCategoryIds]);
        await client.query('DELETE FROM customer_tag_links WHERE "customerId" = $1 AND NOT ("tagId" = ANY($2::uuid[]))', [e.target.id, e.targetTagIds]);
        await client.query(
          `UPDATE customers c SET "fullName" = r."fullName", email = r.email, "phoneNumber" = r."phoneNumber", "whatsappId" = r."whatsappId",
                  "instagramId" = r."instagramId", "facebookId" = r."facebookId", "marketingOptOut" = r."marketingOptOut",
                  "marketingOptOutAt" = r."marketingOptOutAt", notes = r.notes, "updatedAt" = r."updatedAt"
             FROM json_populate_record(NULL::customers, $2::json) r WHERE c.id = $1`, [e.target.id, JSON.stringify(e.target)]);
        await client.query('INSERT INTO customers SELECT * FROM json_populate_record(NULL::customers, $1::json) ON CONFLICT DO NOTHING', [JSON.stringify(e.source)]);
      }
      for (const id of e.sourceCategoryIds) await client.query('INSERT INTO customer_category_links ("customerId", "categoryId") VALUES ($1, $2) ON CONFLICT DO NOTHING', [e.source.id, id]);
      for (const id of e.sourceTagIds) await client.query('INSERT INTO customer_tag_links ("customerId", "tagId") VALUES ($1, $2) ON CONFLICT DO NOTHING', [e.source.id, id]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
    await restoreConversations(col, e.conversations);
    n += 1;
  }
  console.log(`Rolled back ${n} customers from ${path.basename(file)}.`);
}

async function main() {
  const client = pg();
  const m = mongo();
  await client.connect();
  await m.connect();
  const col = m.db().collection('conversations');
  console.log(`mode=${args.rollback ? 'ROLLBACK' : APPLY ? 'APPLY' : 'DRY-RUN'}\n`);
  try {
    if (args.rollback) return await rollback(client, m.db(), args.rollback);

    const { rows: [main] } = await client.query('SELECT id, name, "organizationId" FROM stores WHERE id = $1', [MAIN]);
    if (!main) throw new Error('Main branch not found');
    const { rows: stores } = await client.query('SELECT id, name FROM stores WHERE "organizationId" = $1 AND id <> $2', [main.organizationId, MAIN]);
    const branches = stores.map((s) => ({ ...s, clean: letters(s.name) }));

    const { rows: mainCustomers } = await client.query(
      'SELECT id, "fullName", "phoneNumber", "whatsappId", "updatedAt" FROM customers WHERE "storeId" = $1', [MAIN]);
    const byId = new Map(mainCustomers.map((c) => [c.id, c]));
    const byPhone = new Map();
    for (const c of mainCustomers) {
      const p = normalize(c.phoneNumber || c.whatsappId);
      if (p && !byPhone.has(p)) byPhone.set(p, c);
    }

    const conversations = await col.find(
      { storeId: MAIN, platform: 'whatsapp' },
      { projection: { customerPhone: 1, customerId: 1, 'messages.from': 1, 'messages.text': 1, 'messages.type': 1, 'messages.timestamp': 1 } },
    ).toArray();
    const plan = new Map();
    const waCustomerIds = new Set();
    const orphans = [];
    let noBranch = 0;
    for (const conv of conversations) {
      const customer = (conv.customerId && byId.get(conv.customerId)) || byPhone.get(normalize(conv.customerPhone));
      if (!customer) { orphans.push(conv); continue; }
      waCustomerIds.add(customer.id);
      const pick = pickBranch(conv.messages, branches);
      if (!pick) { noBranch += 1; continue; }
      plan.set(customer.id, { customer, store: pick.store, how: pick.how });
    }

    const phones = [...plan.values()].map((p) => normalize(p.customer.phoneNumber || p.customer.whatsappId));
    const { rows: targets } = await client.query(
      `SELECT c.id, c."storeId", ${PHONE_SQL} AS phone FROM customers c
        WHERE c."storeId" = ANY($1::uuid[]) AND ${PHONE_SQL} = ANY($2::text[])`, [branches.map((b) => b.id), phones]);
    const targetKey = new Map(targets.map((t) => [`${t.storeId}:${t.phone}`, t.id]));
    for (const p of plan.values()) {
      p.targetId = targetKey.get(`${p.store.id}:${normalize(p.customer.phoneNumber || p.customer.whatsappId)}`) || null;
    }

    fs.mkdirSync(JOURNAL_DIR, { recursive: true });
    const previousJournals = fs.readdirSync(JOURNAL_DIR).filter((f) => /^transfer-journal-\d+\.jsonl$/.test(f));
    const previousKept = new Set([
      ...EARLIER_KEPT_IDS,
      ...previousJournals.flatMap((f) => readJournal(path.join(JOURNAL_DIR, f))).filter((e) => e.kind === 'customer' && e.keptId).map((e) => e.keptId),
    ]);

    console.log(`main-branch customers: ${mainCustomers.length}`);
    console.log(`main-branch WhatsApp conversations: ${conversations.length}  (left behind by an interrupted run -> repair: ${orphans.length})`);
    console.log(`customers with a WhatsApp conversation: ${waCustomerIds.size}`);
    console.log(`  branch picked -> will transfer: ${plan.size}`);
    console.log(`  no branch picked -> stay in main: ${noBranch}`);
    console.log(`customers moved by earlier runs (first run + journals: ${previousJournals.length}): ${previousKept.size}`);
    const summary = {};
    for (const p of plan.values()) {
      const s = (summary[p.store.name] ||= { move: 0, merge: 0, 'فرع X': 0, X: 0, 'عروض': 0 });
      s[p.targetId ? 'merge' : 'move'] += 1;
      s[p.how] += 1;
    }
    console.log('\nper branch (move = new to branch, merge = already there):');
    Object.entries(summary).sort((a, b) => (b[1].move + b[1].merge) - (a[1].move + a[1].merge))
      .forEach(([name, s]) => console.log(`  ${name.padEnd(12)} total=${s.move + s.merge}  move=${s.move}  merge=${s.merge}  (by "فرع X": ${s['فرع X']}, by bare name: ${s.X}, by offers region: ${s['عروض']})`));

    const { rows: [existingCategory] } = await client.query(
      `SELECT id FROM customer_categories WHERE "organizationId" = $1 AND scope = 'organization' AND TRIM(name) = $2`, [main.organizationId, CATEGORY_NAME]);
    console.log(`\nCategory "${CATEGORY_NAME}": ${existingCategory ? 'exists' : 'will be created at organization scope'}; linked to every main-branch WhatsApp customer (transferred and staying)`);

    if (!APPLY) {
      console.log('DRY-RUN only. Nothing was written. Re-run with --apply.');
      return;
    }

    const journal = path.join(JOURNAL_DIR, `transfer-journal-${Date.now()}.jsonl`);
    console.log(`Journal (for rollback): ${journal}\n`);
    let categoryId = existingCategory?.id;
    if (!categoryId) {
      const { rows: [created] } = await client.query(
        `INSERT INTO customer_categories ("organizationId", scope, "storeId", name, color, "isActive", "sortOrder")
         VALUES ($1, 'organization', NULL, $2, $3, true, 0) RETURNING id`, [main.organizationId, CATEGORY_NAME, CATEGORY_COLOR]);
      categoryId = created.id;
    }
    const linkCategory = async (ids, db = client) => {
      if (!ids.length) return [];
      const { rows } = await db.query(
        `INSERT INTO customer_category_links ("customerId", "categoryId") SELECT unnest($1::uuid[]), $2 ON CONFLICT DO NOTHING RETURNING "customerId"`, [ids, categoryId]);
      return rows.map((r) => r.customerId);
    };

    // 1. tael-bot for customers that stay in main and for customers moved by earlier (interrupted) runs.
    const staying = [...waCustomerIds].filter((id) => !plan.has(id));
    const earlyLinks = await linkCategory([...staying, ...previousKept]);
    journalLine(journal, { kind: 'category', categoryId, created: !existingCategory, customerIds: earlyLinks });
    console.log(`tael-bot linked now: ${earlyLinks.length} (staying + earlier runs)`);

    // 2. Repair conversations an interrupted run left in main.
    let repaired = 0;
    for (const conv of orphans) {
      let kept = conv.customerId
        ? (await client.query('SELECT id, "storeId" FROM customers WHERE id = $1', [conv.customerId])).rows[0]
        : null;
      if (!kept || kept.storeId === MAIN) {
        kept = (await client.query(
          `SELECT c.id, c."storeId" FROM customers c JOIN stores s ON s.id = c."storeId"
            WHERE s."organizationId" = $1 AND c."storeId" <> $2 AND ${PHONE_SQL} = $3 ORDER BY c."updatedAt" DESC LIMIT 1`,
          [main.organizationId, MAIN, normalize(conv.customerPhone)])).rows[0];
      }
      if (!kept) { console.log(`  repair skipped: no customer for conversation ${conv._id}`); continue; }
      const moved = await moveConversations(col, { _id: conv._id }, kept.storeId, kept.id);
      const linked = await linkCategory([kept.id]);
      journalLine(journal, { kind: 'repair', categoryId, keptId: kept.id, taelBotLinked: linked.length > 0, conversations: moved });
      repaired += 1;
    }
    if (orphans.length) console.log(`repaired conversations: ${repaired}/${orphans.length}`);

    // 3. Transfer, one committed customer at a time.
    let done = 0;
    for (const p of plan.values()) {
      const sourceId = p.customer.id;
      const targetStoreId = p.store.id;
      const entry = { kind: 'customer', categoryId, mode: p.targetId ? 'merge' : 'move', conversations: [] };

      await client.query('BEGIN');
      try {
        const { rows: [source] } = await client.query('SELECT * FROM customers WHERE id = $1 AND "storeId" = $2 FOR UPDATE', [sourceId, MAIN]);
        if (!source) { await client.query('ROLLBACK'); continue; }
        const links = async (id) => ({
          categories: (await client.query(
            `SELECT l."categoryId" AS id, c.scope, c."storeId" FROM customer_category_links l JOIN customer_categories c ON c.id = l."categoryId" WHERE l."customerId" = $1`, [id])).rows,
          tags: (await client.query(
            `SELECT l."tagId" AS id, t.scope, t."storeId" FROM customer_tag_links l JOIN customer_tags t ON t.id = l."tagId" WHERE l."customerId" = $1`, [id])).rows,
        });
        const fits = (item) => item.scope === 'organization' || item.storeId === targetStoreId;
        const sourceLinks = await links(sourceId);
        entry.source = source;
        entry.sourceCategoryIds = sourceLinks.categories.map((c) => c.id);
        entry.sourceTagIds = sourceLinks.tags.map((t) => t.id);

        let keptId;
        if (!p.targetId) {
          await client.query('UPDATE customers SET "storeId" = $2, "updatedAt" = now() WHERE id = $1', [sourceId, targetStoreId]);
          const dropCats = sourceLinks.categories.filter((c) => !fits(c)).map((c) => c.id);
          const dropTags = sourceLinks.tags.filter((t) => !fits(t)).map((t) => t.id);
          if (dropCats.length) await client.query('DELETE FROM customer_category_links WHERE "customerId" = $1 AND "categoryId" = ANY($2::uuid[])', [sourceId, dropCats]);
          if (dropTags.length) await client.query('DELETE FROM customer_tag_links WHERE "customerId" = $1 AND "tagId" = ANY($2::uuid[])', [sourceId, dropTags]);
          keptId = sourceId;
        } else {
          const { rows: [target] } = await client.query('SELECT * FROM customers WHERE id = $1 FOR UPDATE', [p.targetId]);
          const targetLinks = await links(target.id);
          entry.target = target;
          entry.targetCategoryIds = targetLinks.categories.map((c) => c.id);
          entry.targetTagIds = targetLinks.tags.map((t) => t.id);
          const identifier = source.phoneNumber || source.whatsappId || '';
          const merged = {
            fullName: isPlaceholderName(target.fullName, identifier) && !isPlaceholderName(source.fullName, identifier) ? source.fullName : target.fullName,
            email: target.email || source.email,
            phoneNumber: target.phoneNumber || source.phoneNumber,
            whatsappId: target.whatsappId || source.whatsappId,
            instagramId: target.instagramId || source.instagramId,
            facebookId: target.facebookId || source.facebookId,
            marketingOptOut: target.marketingOptOut || source.marketingOptOut,
            marketingOptOutAt: target.marketingOptOut ? target.marketingOptOutAt : source.marketingOptOut ? source.marketingOptOutAt : target.marketingOptOutAt,
            notes: [target.notes, source.notes].filter((n) => n?.trim()).join('\n\n') || target.notes,
          };
          await client.query(
            `UPDATE customers SET "fullName" = $2, email = $3, "phoneNumber" = $4, "whatsappId" = $5, "instagramId" = $6, "facebookId" = $7,
                    "marketingOptOut" = $8, "marketingOptOutAt" = $9, notes = $10, "updatedAt" = now() WHERE id = $1`,
            [target.id, merged.fullName, merged.email, merged.phoneNumber, merged.whatsappId, merged.instagramId, merged.facebookId,
              merged.marketingOptOut, merged.marketingOptOutAt, merged.notes]);
          for (const c of sourceLinks.categories.filter(fits)) await client.query('INSERT INTO customer_category_links ("customerId", "categoryId") VALUES ($1, $2) ON CONFLICT DO NOTHING', [target.id, c.id]);
          for (const t of sourceLinks.tags.filter(fits)) await client.query('INSERT INTO customer_tag_links ("customerId", "tagId") VALUES ($1, $2) ON CONFLICT DO NOTHING', [target.id, t.id]);
          await client.query('DELETE FROM customers WHERE id = $1', [sourceId]);
          keptId = target.id;
        }
        entry.taelBotLinked = (await linkCategory([keptId])).length > 0;
        await client.query('COMMIT');
        entry.keptId = keptId;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }

      const phone = normalize(entry.source.phoneNumber || entry.source.whatsappId);
      const match = [{ customerId: sourceId }];
      if (phone) match.push({ platform: 'whatsapp', customerPhone: phone });
      if (entry.source.instagramId) match.push({ platform: 'instagram', customerPhone: entry.source.instagramId });
      if (entry.source.facebookId) match.push({ platform: 'facebook', customerPhone: entry.source.facebookId });
      entry.conversations = await moveConversations(col, { storeId: MAIN, $or: match }, targetStoreId, entry.keptId);
      journalLine(journal, entry);
      done += 1;
      if (done % 100 === 0) console.log(`  ${done}/${plan.size}`);
    }

    console.log(`\nDone. transferred=${done}  repaired=${repaired}\nJournal (for rollback): ${journal}`);
  } finally {
    await client.end();
    await m.close();
  }
}

main().catch((error) => { console.error(error.message); process.exit(1); });
