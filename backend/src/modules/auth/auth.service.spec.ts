import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';
import { OrganizationsService } from '../organizations/organizations.service';
import { StoresService } from '../stores/stores.service';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { SmsService } from './sms.service';

jest.mock('bcrypt', () => ({
  compare: jest.fn(),
  hash: jest.fn(),
}));

describe('AuthService', () => {
  let service: AuthService;
  let usersService: UsersService;

  const mockUser = {
    id: '1',
    email: 'test@labbaik.ai',
    password: 'hashedPassword',
    fullName: 'Test User',
    role: 'admin',
  };

  const mockUsersService = {
    findByEmail: jest.fn(),
    create: jest.fn(),
  };

  const mockJwtService = {
    sign: jest.fn(() => 'mockToken'),
  };

  // AuthService gained these when organizations were added; login only needs the user's organization.
  const mockOrganizationsService = {
    ensureForUser: jest.fn(async () => ({ id: 'org-1', name: 'Test Org' })),
    getMembership: jest.fn(async () => ({ organization: { id: 'org-1', name: 'Test Org' }, membership: { role: 'owner' } })),
    createForUser: jest.fn(),
  };
  const mockStoresService = { createBranch: jest.fn() };
  const mockSmsService = { send: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: mockUsersService },
        { provide: JwtService, useValue: mockJwtService },
        { provide: OrganizationsService, useValue: mockOrganizationsService },
        { provide: StoresService, useValue: mockStoresService },
        { provide: SmsService, useValue: mockSmsService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    usersService = module.get<UsersService>(UsersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('login', () => {
    it('should return a user and token for valid credentials', async () => {
      jest.spyOn(usersService, 'findByEmail').mockResolvedValue(mockUser as any);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result: any = await service.login({ email: 'test@labbaik.ai', password: 'password' });
      
      expect(result).toHaveProperty('token', 'mockToken');
      expect(result.user.email).toBe('test@labbaik.ai');
      expect(result.user).not.toHaveProperty('password');
      expect(mockJwtService.sign).toHaveBeenCalledWith(expect.objectContaining({ sub: '1', organizationId: 'org-1' }));
    });

    it('should throw UnauthorizedException for invalid password', async () => {
      jest.spyOn(usersService, 'findByEmail').mockResolvedValue(mockUser as any);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(service.login({ email: 'test@labbaik.ai', password: 'wrong' }))
        .rejects.toThrow(UnauthorizedException);
    });
  });

  describe('support-role login', () => {
    const supportUser = { ...mockUser, role: 'employee', phoneNumber: '966501234567' };
    beforeEach(() => {
      mockOrganizationsService.getMembership.mockResolvedValue({ organization: { id: 'org-1', name: 'Test Org' }, membership: { role: 'agent' } } as any);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      jest.spyOn(usersService, 'findByEmail').mockResolvedValue(supportUser as any);
    });

    it('sends a code instead of a session token', async () => {
      const result: any = await service.login({ email: 'test@labbaik.ai', password: 'password' });
      expect(result).toMatchObject({ otpRequired: true, phone: '05•••••567' });
      expect(result).not.toHaveProperty('token');
      expect(mockSmsService.send).toHaveBeenCalledWith('966501234567', expect.stringMatching(/\d{6}/));
      expect(mockJwtService.sign).toHaveBeenCalledWith({ sub: '1', purpose: 'login-otp' }, expect.anything());
    });

    it('refuses a support member without a phone number', async () => {
      jest.spyOn(usersService, 'findByEmail').mockResolvedValue({ ...supportUser, phoneNumber: null } as any);
      await expect(service.login({ email: 'test@labbaik.ai', password: 'password' })).rejects.toThrow(ForbiddenException);
      expect(mockSmsService.send).not.toHaveBeenCalled();
    });

    it('signs in with the texted code, and only once', async () => {
      await service.login({ email: 'test@labbaik.ai', password: 'password' });
      const code = (mockSmsService.send.mock.calls[0][1] as string).match(/\d{6}/)![0];
      (mockJwtService as any).verify = jest.fn(() => ({ sub: '1', purpose: 'login-otp' }));
      (mockUsersService as any).findById = jest.fn(async () => supportUser);
      await expect(service.verifyLoginCode('challenge', code === '000000' ? '111111' : '000000')).rejects.toThrow('رمز التحقق غير صحيح.');
      const result: any = await service.verifyLoginCode('challenge', code);
      expect(result).toHaveProperty('token', 'mockToken');
      await expect(service.verifyLoginCode('challenge', code)).rejects.toThrow(UnauthorizedException);
    });

    it('rejects a normal session token as a challenge', async () => {
      (mockJwtService as any).verify = jest.fn(() => ({ sub: '1', email: 'x' }));
      await expect(service.verifyLoginCode('session-token', '123456')).rejects.toThrow(UnauthorizedException);
    });
  });
});
