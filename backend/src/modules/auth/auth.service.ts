import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { RegisterDto, LoginDto } from './dto/auth.dto';
import * as bcrypt from 'bcrypt';
import { OrganizationsService } from '../organizations/organizations.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly organizationsService: OrganizationsService,
  ) {}

  async register(registerDto: RegisterDto) {
    const { email, password, fullName } = registerDto;
    
    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Create user
    const user = await this.usersService.create({
      email,
      password: hashedPassword,
      fullName,
    });

    const organization = await this.organizationsService.ensureForUser(user.id);
    const token = this.jwtService.sign({ sub: user.id, email: user.email, role: user.role, organizationId: organization.id });
    return { user, organization, token };
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
