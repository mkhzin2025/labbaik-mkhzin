import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BillingService } from './billing.service';

@Injectable()
export class BillingRenewalService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(BillingRenewalService.name);
  private timer?: NodeJS.Timeout;

  constructor(private readonly billing: BillingService, private readonly config: ConfigService) {}

  onApplicationBootstrap() {
    const enabled = String(this.config.get<string>('BILLING_RENEWAL_WORKER_ENABLED') || 'true').toLowerCase() !== 'false';
    if (!enabled) return;
    const run = () => this.billing.processDueRenewals().catch((error) => this.logger.error(`Billing renewals failed: ${error.message}`));
    this.timer = setInterval(run, 60 * 60 * 1000);
    this.timer.unref?.();
    setTimeout(run, 15_000).unref?.();
  }

  onApplicationShutdown() {
    if (this.timer) clearInterval(this.timer);
  }
}
