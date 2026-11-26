import { inboxSearchClause } from './inbox-search';

describe('inboxSearchClause', () => {
  it.each([
    ['0501234567'],
    ['+966 50 123 4567'],
    ['00966501234567'],
    ['966501234567'],
    ['501234567'],
    ['050-123-4567'],
    ['٠٥٠١٢٣٤٥٦٧'],
  ])('finds the whole number %s exactly', (input) => {
    expect(inboxSearchClause(input)).toEqual({ customerPhone: '966501234567' });
  });

  it('matches the start of a local number as a prefix', () => {
    expect(inboxSearchClause('05012')).toEqual({ customerPhone: { $regex: '^96650' + '12' } });
    expect(inboxSearchClause('96650')).toEqual({ customerPhone: { $regex: '^96650' } });
  });

  it('matches the last digits anywhere in the number', () => {
    expect(inboxSearchClause('4567')).toEqual({ customerPhone: { $regex: '4567' } });
  });

  it('keeps a full foreign number exact', () => {
    expect(inboxSearchClause('+20 100 123 4567')).toEqual({ customerPhone: '201001234567' });
  });

  it('searches names and messages for text', () => {
    const clause = inboxSearchClause(' أحمد ');
    expect(clause.$or).toHaveLength(3);
    expect(clause.$or[0].customerName.test('أحمد ياسين')).toBe(true);
  });
});

describe('phoneSearch elsewhere', () => {
  it('treats short or non-number input as text', () => {
    const { phoneSearch } = jest.requireActual('../../common/utils/phone.util');
    expect(phoneSearch('12')).toBeNull();
    expect(phoneSearch('أحمد 050')).toBeNull();
    expect(phoneSearch('00971501234567')).toEqual({ exact: '971501234567' });
  });
});
