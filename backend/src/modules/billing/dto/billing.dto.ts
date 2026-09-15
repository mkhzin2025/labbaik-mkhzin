import { IsBoolean, IsInt, IsNumber, IsObject, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

export class CreatePlanDto {
  @IsString() code: string;
  @IsString() nameAr: string;
  @IsOptional() @IsString() nameEn?: string;
  @IsOptional() @IsString() description?: string;
  @IsInt() @Min(0) monthlyPriceMinor: number;
  @IsOptional() @IsString() currency?: string;
  @IsOptional() @IsInt() @Min(0) @Max(365) trialDays?: number;
  @IsOptional() @IsObject() limits?: Record<string, any>;
  @IsOptional() @IsObject() features?: Record<string, any>;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsBoolean() isPublic?: boolean;
  @IsOptional() @IsInt() sortOrder?: number;
}

export class UpdatePlanDto {
  @IsOptional() @IsString() code?: string;
  @IsOptional() @IsString() nameAr?: string;
  @IsOptional() @IsString() nameEn?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsInt() @Min(0) monthlyPriceMinor?: number;
  @IsOptional() @IsString() currency?: string;
  @IsOptional() @IsInt() @Min(0) @Max(365) trialDays?: number;
  @IsOptional() @IsObject() limits?: Record<string, any>;
  @IsOptional() @IsObject() features?: Record<string, any>;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsBoolean() isPublic?: boolean;
  @IsOptional() @IsInt() sortOrder?: number;
}

export class AssignSubscriptionDto {
  @IsUUID() organizationId: string;
  @IsUUID() planId: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsBoolean() autoRenew?: boolean;
  @IsOptional() @IsUUID() paymentMethodId?: string;
  @IsOptional() @IsString() currentPeriodEnd?: string;
}

export class SubscribeDto {
  @IsUUID() planId: string;
  @IsOptional() @IsUUID() paymentMethodId?: string;
}

export class CreateTopUpIntentDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1)
  @Max(50000)
  amountSar: number;
}

export class RegisterCheckoutDto {
  @IsUUID() intentId: string;
  @IsString() providerPaymentId: string;
  @IsOptional() @IsString() providerToken?: string;
}

export class VerifyPaymentDto {
  @IsString() paymentId: string;
}

export class SavedCardTopUpDto {
  @IsUUID() paymentMethodId: string;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(1) @Max(50000) amountSar: number;
}

export class WalletSettingsDto {
  @IsOptional() @IsBoolean() autoRechargeEnabled?: boolean;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(1) autoRechargeThresholdSar?: number;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(1) @Max(50000) autoRechargeAmountSar?: number;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) lowBalanceThresholdSar?: number;
}

export class SetDefaultPaymentMethodDto {
  @IsUUID() paymentMethodId: string;
}

export class UpdatePricingRuleDto {
  @IsNumber({ maxDecimalPlaces: 6 }) @Min(0) priceSar: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class AdminWalletAdjustmentDto {
  @IsUUID() organizationId: string;
  @IsNumber({ maxDecimalPlaces: 6 }) amountSar: number;
  @IsString() reason: string;
}
