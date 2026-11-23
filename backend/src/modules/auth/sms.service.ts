import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

/** Text messages through Msegat (https://msegat.docs.apiary.io). */
@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);

  constructor(private readonly config: ConfigService) {}

  async send(phoneNumber: string, message: string) {
    const apiKey = this.config.get<string>('MSEGAT_API_KEY');
    const userName = this.config.get<string>('MSEGAT_USERNAME');
    const userSender = this.config.get<string>('MSEGAT_SENDER');
    if (!apiKey || !userName || !userSender) {
      if (this.config.get<string>('NODE_ENV') !== 'production') {
        this.logger.warn(`Msegat is not configured. SMS to ${phoneNumber}: ${message}`);
        return;
      }
      throw new ServiceUnavailableException('خدمة الرسائل النصية غير مهيأة. تواصل مع مدير النظام.');
    }

    const url = this.config.get<string>('MSEGAT_BASE_URL') || 'https://www.msegat.com/gw/sendsms.php';
    try {
      const { data } = await axios.post(url, { userName, apiKey, userSender, numbers: phoneNumber, msg: message, msgEncoding: 'UTF8' }, { timeout: 15000 });
      const code = String(data?.code ?? '');
      if (code !== '1' && code !== 'M0000') throw new Error(`Msegat ${code}: ${data?.message ?? ''}`);
    } catch (error) {
      this.logger.error(`SMS to ${phoneNumber} failed: ${(error as Error).message}`);
      throw new ServiceUnavailableException('تعذر إرسال رسالة التحقق. حاول مرة أخرى بعد قليل.');
    }
  }
}
