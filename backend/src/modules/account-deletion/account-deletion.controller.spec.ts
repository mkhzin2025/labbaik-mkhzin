import { AccountDeletionController } from './account-deletion.controller';
import { AccountDeletionStatus } from './entities/account-deletion-request.entity';

describe('AccountDeletionController', () => {
  let controller: AccountDeletionController;
  let service: any;

  beforeEach(() => {
    service = {
      createPublicRequest: jest.fn().mockResolvedValue({
        success: true,
        message: 'إذا كانت البيانات المدخلة مرتبطة بحساب في لبيك، فسيتم إرسال تعليمات التحقق والمتابعة.',
      }),
      listRequestsForAdmin: jest.fn().mockResolvedValue([]),
      updateStatusForAdmin: jest.fn().mockResolvedValue({
        id: 'req-1',
        status: AccountDeletionStatus.VERIFIED,
      }),
    };

    controller = new AccountDeletionController(service);
  });

  it('should call createPublicRequest on public endpoint', async () => {
    const mockReq = {
      headers: {
        'x-forwarded-for': '192.168.1.1, 10.0.0.1',
        'user-agent': 'Chrome/120',
      },
    };

    const res = await controller.createPublicRequest(
      { email: 'user@example.com', reason: 'Test' },
      mockReq,
    );

    expect(res.success).toBe(true);
    expect(service.createPublicRequest).toHaveBeenCalledWith(
      { email: 'user@example.com', reason: 'Test' },
      '192.168.1.1',
      'Chrome/120',
    );
  });

  it('should call listRequestsForAdmin on admin endpoint', async () => {
    const res = await controller.listRequestsForAdmin();
    expect(res).toEqual([]);
    expect(service.listRequestsForAdmin).toHaveBeenCalled();
  });
});
