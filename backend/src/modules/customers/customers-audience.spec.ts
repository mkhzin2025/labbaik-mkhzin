import { BadRequestException } from '@nestjs/common';
import { audienceToFilters } from './customers.service';

describe('audienceToFilters', () => {
  const storeIds = ['store-1', 'store-2'];

  it('targets only the hand-picked customers in manual mode, ignoring segment criteria', () => {
    const filters = audienceToFilters({ mode: 'manual', customerIds: ['c1'], categoryIds: ['cat'], excludeCustomerIds: ['c2'] }, storeIds);
    expect(filters).toEqual({ storeIds, customerIds: ['c1'] });
  });

  it('keeps an empty manual selection empty instead of falling back to everyone', () => {
    expect(audienceToFilters({ mode: 'manual' }, storeIds).customerIds).toEqual([]);
  });

  it('applies only branch scope and individual exclusions in "all" mode', () => {
    const filters = audienceToFilters({ mode: 'all', categoryIds: ['cat'], excludeCustomerIds: ['c2'] }, storeIds);
    expect(filters).toEqual({ storeIds, excludeCustomerIds: ['c2'] });
  });

  it('carries every segment criterion through', () => {
    const filters = audienceToFilters({
      mode: 'segment', categoryIds: ['cat'], tagIds: ['t1', 't2'], tagMatch: 'all', excludeCategoryIds: ['x'], excludeTagIds: ['y'],
    }, storeIds);
    expect(filters).toMatchObject({ storeIds, categoryIds: ['cat'], tagIds: ['t1', 't2'], tagMatch: 'all', excludeCategoryIds: ['x'], excludeTagIds: ['y'] });
  });

  it('rejects a segment with no criteria', () => {
    expect(() => audienceToFilters({ mode: 'segment' }, storeIds)).toThrow(BadRequestException);
  });
});
