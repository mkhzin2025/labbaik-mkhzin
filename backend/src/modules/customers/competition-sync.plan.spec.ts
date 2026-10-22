import { branchKey, emptyStats, planCompetitionPage } from './competition-sync.plan';

describe('competition sync plan', () => {
  const stores = new Map([
    [branchKey('طويق'), 'store-tuwaiq'],
    [branchKey('المروة'), 'store-marwa'],
  ]);

  it('normalizes branch names written with "فرع", "حي" and emoji', () => {
    expect(branchKey('▪️فرع حي المروة')).toBe('المروة');
    expect(branchKey(' فرع طويق ')).toBe('طويق');
    expect(branchKey('حفر الباطن')).toBe('حفر الباطن');
  });

  it('routes each participant to its branch and picks the category from the registration type', () => {
    const stats = emptyStats(1, 1);
    const plan = planCompetitionPage([
      { fullName: 'سارة', phone: '0501234567', branch: 'طويق', status: 'REGISTERED', registrationType: 'direct' },
      { fullName: 'خالد', phone: '+966 55 000 1111', branch: 'فرع حي المروة', status: 'REGISTERED', registrationType: 'referral' },
      { fullName: 'منى', phone: '966560002222', branch: 'المروة', status: 'REGISTERED', registrationType: 'source' },
    ], stores, stats);

    expect([...plan.get('store-tuwaiq')!.values()]).toEqual([{ phone: '966501234567', name: 'سارة', online: false }]);
    expect([...plan.get('store-marwa')!.values()]).toEqual([
      { phone: '966550001111', name: 'خالد', online: true },
      { phone: '966560002222', name: 'منى', online: true },
    ]);
    expect(stats.participants).toBe(3);
  });

  it('skips cancelled participants, unusable phones and unknown branches, and counts each', () => {
    const stats = emptyStats(1, 1);
    const plan = planCompetitionPage([
      { phone: '0501234567', branch: 'طويق', status: 'CANCELLED', registrationType: 'direct' },
      { phone: '12', branch: 'طويق', status: 'REGISTERED', registrationType: 'direct' },
      { phone: '0501234568', branch: 'النظيم', status: 'REGISTERED', registrationType: 'direct' },
      { phone: '0501234569', branch: null, status: 'REGISTERED', registrationType: 'direct' },
    ], stores, stats);

    expect(plan.size).toBe(0);
    expect(stats).toMatchObject({ participants: 4, cancelled: 1, invalidPhone: 1, unknownBranches: { 'النظيم': 1, 'بدون فرع': 1 } });
  });

  it('keeps one entry per phone and branch when a number appears twice on a page', () => {
    const stats = emptyStats(1, 1);
    const plan = planCompetitionPage([
      { fullName: 'قديم', phone: '0501234567', branch: 'طويق', status: 'REGISTERED', registrationType: 'direct' },
      { fullName: 'جديد', phone: '966501234567', branch: 'طويق', status: 'REGISTERED', registrationType: 'referral' },
    ], stores, stats);

    expect([...plan.get('store-tuwaiq')!.values()]).toEqual([{ phone: '966501234567', name: 'جديد', online: true }]);
  });
});
