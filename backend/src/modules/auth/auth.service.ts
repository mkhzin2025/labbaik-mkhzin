import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { RegisterDto, LoginDto } from './dto/auth.dto';
import * as bcrypt from 'bcrypt';
import { OrganizationsService } from '../organizations/organizations.service';
import { StoresService } from '../stores/stores.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly organizationsService: OrganizationsService,
    private readonly storesService: StoresService,
  ) {}

  async register(registerDto: RegisterDto) {
    const { email, password, fullName, organizationName, branchName, phoneNumber } = registerDto;
    
    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Create user
    const user = await this.usersService.create({
      email,
      password: hashedPassword,
      fullName,
    });

    // Create custom organization for this new tenant
    const organization = await this.organizationsService.createForUser(user.id, organizationName);

    // Create default initial branch for the organization
    const store = await this.storesService.createBranch(
      {
        name: branchName?.trim() || 'الفرع الرئيسي',
        phoneNumber: phoneNumber?.trim() || undefined,
        description: `الفرع الرئيسي لـ ${organization.name}`,
      },
      user,
      organization.id,
    );

    const token = this.jwtService.sign({
      sub: user.id,
      email: user.email,
      role: user.role,
      organizationId: organization.id,
    });

    const userResponse: any = { ...user };
    delete userResponse.password;

    return { user: userResponse, organization, store, token };
  }

  async login(loginDto: LoginDto) {
    const { email, password } = loginDto;
    const user = await this.usersService.findByEmail(email);

    if (!user || !(await bcrypt.compare(password, user.password))) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const organization = await this.organizationsService.ensureForUser(user.id);
    const token = this.jwtService.sign({ sub: user.id, email: user.email, role: user.role, organizationId: organization.id });
    
    // Remove password before returning
    const userResponse: any = { ...user };
    delete userResponse.password;

    return { user: userResponse, organization, token };
  }
}
