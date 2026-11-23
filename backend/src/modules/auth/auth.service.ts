import { ForbiddenException, HttpException, HttpStatus, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { RegisterDto, LoginDto } from './dto/auth.dto';
import * as bcrypt from 'bcrypt';
import { OrganizationsService } from '../organizations/organizations.service';
import { StoresService } from '../stores/stores.service';
import { memberRoleOf } from '../organizations/roles';
import { User } from '../users/entities/user.entity';
import { SmsService } from './sms.service';
import { LoginOtpStore, maskPhone, OTP_RESEND_SECONDS, OTP_TTL_MINUTES } from './login-otp';

/** Marks the short-lived token that only lets a support employee finish signing in. */
export const LOGIN_OTP_PURPOSE = 'login-otp';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly organizationsService: OrganizationsService,
    private readonly storesService: StoresService,
    private readonly smsService: SmsService,
  ) {}

  private readonly otp = new LoginOtpStore();

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

    const { organization, membership } = await this.organizationsService.getMembership(user.id);
    if (memberRoleOf(membership.role) !== 'support') return this.session(user, organization);

    // Support staff confirm every sign-in with a code sent to their own mobile.
    if (!user.phoneNumber) {
      throw new ForbiddenException('لا يوجد رقم جوال مسجّل لحسابك لإرسال رمز التحقق. اطلب من مدير الفريق إضافته من صفحة «الفريق».');
    }
    await this.sendCode(user.id, user.phoneNumber);
    return {
      otpRequired: true,
      challenge: this.jwtService.sign({ sub: user.id, purpose: LOGIN_OTP_PURPOSE }, { expiresIn: `${OTP_TTL_MINUTES * 2}m` }),
      phone: maskPhone(user.phoneNumber),
      resendIn: OTP_RESEND_SECONDS,
    };
  }

  async verifyLoginCode(challenge: string, code: string) {
    const user = await this.challengeUser(challenge);
    const result = this.otp.verify(user.id, code);
    if (result === 'wrong') throw new UnauthorizedException('رمز التحقق غير صحيح.');
    if (result === 'locked') throw new UnauthorizedException('أدخلت رمزًا خاطئًا عدة مرات. ارجع وسجّل الدخول من جديد.');
    if (result === 'expired') throw new UnauthorizedException('انتهت صلاحية الرمز. اطلب رمزًا جديدًا.');
    const { organization } = await this.organizationsService.getMembership(user.id);
    return this.session(user, organization);
  }

  async resendLoginCode(challenge: string) {
    const user = await this.challengeUser(challenge);
    if (!user.phoneNumber) throw new ForbiddenException('لا يوجد رقم جوال مسجّل لحسابك.');
    await this.sendCode(user.id, user.phoneNumber);
    return { phone: maskPhone(user.phoneNumber), resendIn: OTP_RESEND_SECONDS };
  }

  private async sendCode(userId: string, phoneNumber: string) {
    const wait = this.otp.waitSeconds(userId);
    if (wait > 0) throw new HttpException(`انتظر ${wait} ثانية قبل طلب رمز جديد.`, HttpStatus.TOO_MANY_REQUESTS);
    const code = this.otp.issue(userId);
    await this.smsService.send(phoneNumber, `رمز الدخول إلى تيل بوت: ${code}\nصالح لمدة ${OTP_TTL_MINUTES} دقائق. لا تشاركه مع أحد.`);
  }

  private async challengeUser(challenge: string) {
    let payload: { sub?: string; purpose?: string };
    try {
      payload = this.jwtService.verify(String(challenge || ''));
    } catch {
      throw new UnauthorizedException('انتهت جلسة التحقق. سجّل الدخول من جديد.');
    }
    const user = payload.purpose === LOGIN_OTP_PURPOSE && payload.sub ? await this.usersService.findById(payload.sub) : null;
    if (!user) throw new UnauthorizedException('انتهت جلسة التحقق. سجّل الدخول من جديد.');
    return user;
  }

  private session(user: User, organization: { id: string }) {
    const token = this.jwtService.sign({ sub: user.id, email: user.email, role: user.role, organizationId: organization.id });
    const userResponse: any = { ...user };
    delete userResponse.password;
    return { user: userResponse, organization, token };
  }
}
