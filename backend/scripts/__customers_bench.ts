/* Temporary benchmark of the customers list queries on a throwaway database. */
import 'reflect-metadata';
import { Client } from 'pg';
import { DataSource } from 'typeorm';
import { User } from '../src/modules/users/entities/user.entity';
import { Store } from '../src/modules/stores/entities/store.entity';
import { Channel } from '../src/modules/channels/entities/channel.entity';
import { Review } from '../src/modules/reviews/entities/review.entity';
import { Notification } from '../src/modules/notifications/entities/notification.entity';
import { Customer } from '../src/modules/customers/entities/customer.entity';
import { CustomerCategory } from '../src/modules/customers/entities/customer-category.entity';
import { CustomerTag } from '../src/modules/customers/entities/customer-tag.entity';
import { CompetitionSyncState } from '../src/modules/customers/entities/competition-sync-state.entity';
import { Flow } from '../src/modules/flows/entities/flow.entity';
import { Organization } from '../src/modules/organizations/entities/organization.entity';
import { OrganizationMember } from '../src/modules/organizations/entities/organization-member.entity';
import { StoreMember } from '../src/modules/organizations/entities/store-member.entity';
import { MetaWhatsAppConnection } from '../src/modules/meta-whatsapp/entities/meta-whatsapp-connection.entity';
import { WhatsAppTemplate } from '../src/modules/meta-whatsapp/entities/whatsapp-template.entity';
import { WhatsAppCampaign } from '../src/modules/meta-whatsapp/entities/whatsapp-campaign.entity';
import { WhatsAppCampaignRecipient } from '../src/modules/meta-whatsapp/entities/whatsapp-campaign-recipient.entity';
import { BillingPlan } from '../src/modules/billing/entities/billing-plan.entity';
import { Subscription } from '../src/modules/billing/entities/subscription.entity';
import { Wallet } from '../src/modules/billing/entities/wallet.entity';
import { WalletTransaction } from '../src/modules/billing/entities/wallet-transaction.entity';
import { PaymentMethod } from '../src/modules/billing/entities/payment-method.entity';
import { BillingPayment } from '../src/modules/billing/entities/billing-payment.entity';
import { PricingRule } from '../src/modules/billing/entities/pricing-rule.entity';
import { AccountDeletionRequest } from '../src/modules/account-deletion/entities/account-deletion-request.entity';
import { CustomersService } from '../src/modules/customers/customers.service';

const DB = 'labbaik_customers_bench';
const base = { host: 'localhost', port: 55432, user: 'postgres', password: 'x' };
const KEEP = process.argv.includes('--keep');

async function time<T>(label: string, fn: () => Promise<T>, runs = 3) {
  await fn(); // warm
  const t = process.hrtime.bigint();
  for (let i = 0; i < runs; i += 1) await fn();
  const ms = Number(process.hrtime.bigint() - t) / 1e6 / runs;
  console.log(`${label.padEnd(44)} ${ms.toFixed(1).padStart(8)} ms`);
}

async function main() {
  const admin = new Client({ ...base, database: 'postgres' });
  await admin.connect();
  const exists = (await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [DB])).rowCount;
  if (!exists) await admin.query(`CREATE DATABASE ${DB}`);
  const ds = new DataSource({
    type: 'postgres', host: base.host, port: base.port, username: base.user, password: base.password, database: DB, synchronize: !exists, logging: false,
    entities: [User, Store, Channel, Review, Notification, Customer, CustomerCategory, CustomerTag, CompetitionSyncState, Flow, Organization, OrganizationMember, StoreMember, MetaWhatsAppConnection, WhatsAppTemplate, WhatsAppCampaign, WhatsAppCampaignRecipient, BillingPlan, Subscription, Wallet, WalletTransaction, PaymentMethod, BillingPayment, PricingRule, AccountDeletionRequest],
  });
  await ds.initialize();
  const q = (sql: string, params: unknown[] = []) => ds.query(sql, params);
  if (!exists) {
    console.log('seeding...');
    await q(`INSERT INTO organizations (name, slug) VALUES ('Org', 'org')`);
    await q(`INSERT INTO stores (name, "organizationId") SELECT 'فرع ' || g, (SELECT id FROM organizations) FROM generate_series(1, 6) g`);
    await q(`INSERT INTO customer_categories ("organizationId", scope, "storeId", name) SELECT (SELECT id FROM organizations), 'organization', NULL, 'فئة ' || g FROM generate_series(1, 10) g`);
    await q(`INSERT INTO customer_tags ("organizationId", scope, "storeId", name) SELECT (SELECT id FROM organizations), 'organization', NULL, 'تاق ' || g FROM generate_series(1, 30) g`);
    await q(`INSERT INTO customers ("storeId", "fullName", "phoneNumber", "whatsappId", tags, "createdAt", "updatedAt")
             SELECT s.id, (ARRAY['محمد','أحمد','سارة','نورة','خالد','فهد','ريم','عبدالله'])[1 + g % 8] || ' ' || g,
                    '9665' || lpad((g * 7919 % 100000000)::text, 8, '0'), '9665' || lpad((g * 7919 % 100000000)::text, 8, '0'), '[]',
                    now() - (g || ' minutes')::interval, now() - (g || ' seconds')::interval
               FROM generate_series(1, 100000) g
               JOIN LATERAL (SELECT id FROM stores ORDER BY id OFFSET (g % 6) LIMIT 1) s ON true`);
    await q(`INSERT INTO customer_category_links ("customerId", "categoryId")
             SELECT c.id, (SELECT id FROM customer_categories ORDER BY id OFFSET (abs(hashtext(c.id::text)) % 10) LIMIT 1)
               FROM customers c WHERE abs(hashtext(c.id::text)) % 10 < 7`);
    await q(`INSERT INTO customer_tag_links ("customerId", "tagId")
             SELECT DISTINCT c.id, t.id FROM customers c
               JOIN LATERAL (SELECT id FROM customer_tags ORDER BY id OFFSET (abs(hashtext(c.id::text || k::text)) % 30) LIMIT 1) t ON true
               CROSS JOIN generate_series(1, 2) k
              WHERE abs(hashtext(c.id::text)) % 10 < 6
             ON CONFLICT DO NOTHING`);
    await q('ANALYZE');
  }
  const [org] = await q('SELECT id FROM organizations');
  const storeIds: string[] = (await q('SELECT id FROM stores')).map((r: any) => r.id);
  const [cat] = await q('SELECT id FROM customer_categories LIMIT 1');
  const svc = new CustomersService(ds.getRepository(Customer), ds.getRepository(CustomerCategory), ds.getRepository(CustomerTag));
  const scope = { organizationId: org.id };
  const page = (filters: any, opts: any = {}) => svc.findPage(scope, { storeIds, ...filters }, { page: 1, limit: 25, segment: 'all', sort: 'updatedAt', dir: 'desc', ...opts });

  console.log(`customers: ${(await q('SELECT COUNT(*) FROM customers'))[0].count}`);
  await time('page 1, newest first', () => page({}));
  await time('page 200, newest first', () => page({}, { page: 200 }));
  await time('page 1, sort by name', () => page({}, { sort: 'fullName', dir: 'asc' }));
  await time('segment uncategorized', () => page({}, { segment: 'uncategorized' }));
  await time('category filter', () => page({ categoryIds: [cat.id] }));
  await time('search name "سارة 12"', () => page({ search: 'سارة 12' }));
  await time('search phone "0501"', () => page({ search: '0501' }));
  await time('single branch', () => svc.findPage({ storeId: storeIds[0] }, {}, { page: 1, limit: 25, segment: 'all', sort: 'updatedAt', dir: 'desc' }));
  await time('taxonomy usage (one branch)', () => svc.getTaxonomyUsage(storeIds[0]));

  await ds.destroy();
  if (!KEEP) await admin.query(`DROP DATABASE IF EXISTS ${DB}`);
  await admin.end();
}

main().catch((error) => { console.error(error); process.exit(1); });
