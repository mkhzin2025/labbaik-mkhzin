import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';
import { OrganizationsService } from '../organizations/organizations.service';
import { StoresService } from '../stores/stores.service';
import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';

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
    createForUser: jest.fn(),
  };
  const mockStoresService = { createBranch: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: mockUsersService },
        { provide: JwtService, useValue: mockJwtService },
        { provide: OrganizationsService, useValue: mockOrganizationsService },
        { provide: StoresService, useValue: mockStoresService },
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

      const result = await service.login({ email: 'test@labbaik.ai', password: 'password' });
      
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
});
