import { AccountDeletionService } from './account-deletion.service';
import { AccountDeletionStatus } from './entities/account-deletion-request.entity';
import { HttpException, HttpStatus } from '@nestjs/common';

describe('AccountDeletionService', () => {
  let service: AccountDeletionService;
  let requestRepository: any;
  let userRepository: any;
  let memberRepository: any;

  beforeEach(() => {
    requestRepository = {
      create: jest.fn().mockImplementation((dto) => ({ id: 'req-1', ...dto })),
      save: jest.fn().mockImplementation((entity) => Promise.resolve({ ...entity, id: entity.id || 'req-1' })),
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue({
        id: 'req-1',
        email: 'test@example.com',
        status: AccountDeletionStatus.PENDING,
      }),
      query: jest.fn().mockResolvedValue([]),
    };

    userRepository = {
      findOne: jest.fn().mockResolvedValue({ id: 'user-1', email: 'test@example.com' }),
    };

    memberRepository = {
      findOne: jest.fn().mockResolvedValue({ organizationId: 'org-1', userId: 'user-1' }),
    };

    service = new AccountDeletionService(requestRepository, userRepository, memberRepository);
  });

  it('1. Should accept a public deletion request without account enumeration', async () => {
    const res = await service.createPublicRequest(
      { email: 'TEST@example.com', reason: 'Moving to another service' },
      '127.0.0.1',
      'Mozilla/5.0',
    );

    expect(res.success).toBe(true);
    expect(res.message).toBe('إذا كانت البيانات المدخلة مرتبطة بحساب في لبيك، فسيتم إرسال تعليمات التحقق والمتابعة.');
    expect(requestRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'test@example.com',
        status: AccountDeletionStatus.PENDING,
        matchedUserId: 'user-1',
        matchedOrganizationId: 'org-1',
        ipAddress: '127.0.0.1',
        userAgent: 'Mozilla/5.0',
      }),
    );
  });

  it('2. Should enforce rate limiting when excessive requests are submitted', async () => {
    const dto = { email: 'spam@example.com' };
    const ip = '10.0.0.1';

    // First 4 should pass
    await service.createPublicRequest(dto, ip);
    await service.createPublicRequest(dto, ip);
    await service.createPublicRequest(dto, ip);
    await service.createPublicRequest(dto, ip);

    // 5th should fail with 429
    await expect(service.createPublicRequest(dto, ip)).rejects.toThrow(HttpException);
  });

  it('3. Admin can update request status to VERIFIED or COMPLETED', async () => {
    const updated = await service.updateStatusForAdmin('req-1', {
      status: AccountDeletionStatus.VERIFIED,
      adminNotes: 'User identity confirmed via official email',
    });

    expect(updated.status).toBe(AccountDeletionStatus.VERIFIED);
    expect(updated.verifiedAt).toBeDefined();
    expect(updated.adminNotes).toBe('User identity confirmed via official email');
  });
});
