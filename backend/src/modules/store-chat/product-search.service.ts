import { BadGatewayException, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

/** Prices in the ERP exclude VAT; customers are quoted with it. */
export const VAT_RATE = 0.15;
const STORES_TTL_MS = 60 * 60 * 1000;
const PAGE_SIZE = 20;
const SKU_CHUNK = 10;

export interface ErpStore { id: string; name: string }
export interface ProductUnit { productId: string; unitName: string; equivalent: number; qty: number; price: number; barcodes: string[] }
export interface Product { sku: string; name: string; categoryName: string | null; units: ProductUnit[] }

interface RawUnitRow {
  SKU: string; ProductID: string; Name: string; CategoryName: string | null; UnitName: string;
  Equivalent: number; StoreQty: number; StorePrice: number; Barcodes: string | null;
}

/** OData string literal: single quotes are doubled. */
const literal = (value: string) => `'${value.replace(/'/g, "''")}'`;
const round2 = (value: number) => Math.round(value * 100) / 100;

/**
 * Product lookup in the Mkhzin ERP (OData, MKHZIN_ERP_API_URL) for one store/branch: name words, SKU or barcode.
 * The ERP is reached only from the server (plain http, no browser access), for the organizations in
 * MKHZIN_STORE_ORG_IDS. Prices come back with VAT.
 */
@Injectable()
export class ProductSearchService {
  private readonly logger = new Logger(ProductSearchService.name);
  private storesCache: { at: number; stores: ErpStore[] } | null = null;

  constructor(private readonly config: ConfigService) {}

  private get baseUrl() {
    return (this.config.get<string>('MKHZIN_ERP_API_URL') || '').trim().replace(/\/+$/, '');
  }

  isEnabledFor(organizationId?: string | null) {
    const allowed = (this.config.get<string>('MKHZIN_STORE_ORG_IDS') || '').split(',').map((id) => id.trim()).filter(Boolean);
    return Boolean(this.baseUrl && organizationId && allowed.includes(organizationId));
  }

  assertEnabled(organizationId?: string | null) {
    if (!this.isEnabledFor(organizationId)) throw new ForbiddenException('البحث عن المنتجات غير مفعّل لهذه المنشأة.');
  }

  private async odata<T>(path: string, params: Record<string, string | number>): Promise<T> {
    try {
      // Encoded by hand: the ERP does not read "+" as a space, which axios would send.
      const query = Object.entries(params).map(([key, value]) => `${key}=${encodeURIComponent(String(value))}`).join('&');
      const { data } = await axios.get(`${this.baseUrl}/odata/${path}${query ? `?${query}` : ''}`, { timeout: 20000, headers: { Accept: 'application/json' } });
      return data as T;
    } catch (error: any) {
      this.logger.warn(`ERP ${path} failed: ${error?.response?.status ?? error?.code} ${error?.message}`);
      throw new BadGatewayException('تعذر الاتصال بنظام المخزون. حاول مرة أخرى بعد قليل.');
    }
  }

  async stores(): Promise<ErpStore[]> {
    if (this.storesCache && Date.now() - this.storesCache.at < STORES_TTL_MS) return this.storesCache.stores;
    const data = await this.odata<{ value: { StoreID: string; StoreName: string }[] }>('Store', {});
    const stores = (data.value || [])
      .map((s) => ({ id: String(s.StoreID), name: String(s.StoreName || '').trim() }))
      .sort((a, b) => Number(a.id) - Number(b.id));
    this.storesCache = { at: Date.now(), stores };
    return stores;
  }

  /** Every word must be in the name; a lone number also matches the SKU or a barcode. */
  static filterFor(storeId: string, query: string) {
    const parts = [`StoreID eq ${literal(storeId)}`];
    const words = query.trim().split(/\s+/).filter(Boolean).slice(0, 6).map((w) => w.slice(0, 50));
    if (words.length === 1 && /^\d+$/.test(words[0])) {
      const q = words[0];
      parts.push(`(SKU eq ${literal(q)} or contains(Barcodes,${literal(`|${q}|`)}) or contains(Name,${literal(q)}))`);
    } else {
      for (const word of words) parts.push(`contains(Name,${literal(word)})`);
    }
    return parts.join(' and ');
  }

  async search(storeId: string, query: string, page: number) {
    const filter = ProductSearchService.filterFor(storeId, query);
    const skip = (page - 1) * PAGE_SIZE;
    // One row per unit in the ERP: count and page over distinct products, then fetch their units.
    const [counted, products] = await Promise.all([
      this.odata<{ total: number }[]>('RawItem', { $apply: `filter(${filter})/groupby((SKU))/aggregate($count as total)` }),
      this.odata<{ SKU: string; Name: string }[]>('RawItem', { $apply: `filter(${filter})/groupby((SKU,Name))`, $orderby: 'Name', $top: PAGE_SIZE, $skip: skip }),
    ]);
    const total = Number(counted?.[0]?.total) || 0;
    const skus = Array.from(new Set((products || []).map((p) => p.SKU)));
    // "in (...)" is not reliable on this ERP and a filter is capped at 100 nodes: "or" chains of 10 SKUs, in parallel.
    const chunks: string[][] = [];
    for (let i = 0; i < skus.length; i += SKU_CHUNK) chunks.push(skus.slice(i, i + SKU_CHUNK));
    const rows = (await Promise.all(chunks.map((chunk) => this.odata<{ value: RawUnitRow[] }>('RawItem', {
      $filter: `StoreID eq ${literal(storeId)} and (${chunk.map((sku) => `SKU eq ${literal(sku)}`).join(' or ')})`,
      $select: 'SKU,ProductID,Name,CategoryName,UnitName,Equivalent,StoreQty,StorePrice,Barcodes',
    })))).flatMap((data) => data.value || []);
    const result: Product[] = skus.map((sku) => {
      const units = rows.filter((r) => r.SKU === sku).sort((a, b) => a.Equivalent - b.Equivalent);
      const first = units[0];
      return {
        sku,
        name: first?.Name || products.find((p) => p.SKU === sku)?.Name || sku,
        categoryName: first?.CategoryName || null,
        units: units.map((u) => ({
          productId: u.ProductID,
          unitName: u.UnitName,
          equivalent: Number(u.Equivalent) || 1,
          qty: Number(u.StoreQty) || 0,
          price: round2((Number(u.StorePrice) || 0) * (1 + VAT_RATE)),
          barcodes: String(u.Barcodes || '').split(',').map((b) => b.replace(/\|/g, '').trim()).filter(Boolean),
        })),
      };
    });
    return { total, page, pageSize: PAGE_SIZE, totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)), result };
  }
}
