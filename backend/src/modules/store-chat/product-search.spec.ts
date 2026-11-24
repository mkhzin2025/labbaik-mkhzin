import { ProductSearchService } from './product-search.service';

describe('product search filter', () => {
  it('needs every word in the name, within the chosen store', () => {
    expect(ProductSearchService.filterFor('7', '  سكر   ناعم ')).toBe("StoreID eq '7' and contains(Name,'سكر') and contains(Name,'ناعم')");
  });

  it('matches a number against the SKU, barcodes and name', () => {
    expect(ProductSearchService.filterFor('7', '00002')).toBe("StoreID eq '7' and (SKU eq '00002' or contains(Barcodes,'|00002|') or contains(Name,'00002'))");
  });

  it('escapes quotes so a search cannot break out of the filter', () => {
    expect(ProductSearchService.filterFor('7', "o'reo")).toBe("StoreID eq '7' and contains(Name,'o''reo')");
  });
});
