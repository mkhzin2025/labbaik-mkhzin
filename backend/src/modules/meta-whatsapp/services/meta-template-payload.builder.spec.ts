import { BadRequestException } from '@nestjs/common';
import { MetaTemplatePayloadBuilder } from './meta-template-payload.builder';
import { WhatsAppTemplate } from '../entities/whatsapp-template.entity';

describe('MetaTemplatePayloadBuilder', () => {
  let builder: MetaTemplatePayloadBuilder;

  beforeEach(() => {
    builder = new MetaTemplatePayloadBuilder();
  });

  describe('AUTHENTICATION template (e.g. mkhzin_login_otp)', () => {
    const authTemplate: Partial<WhatsAppTemplate> = {
      name: 'mkhzin_login_otp',
      category: 'AUTHENTICATION',
      language: 'ar',
      components: [
        {
          type: 'BODY',
          text: 'رمز التحقق الخاص بك لـ مخزن هو {{1}}. صالح لمدة 10 دقائق.',
        },
        {
          type: 'FOOTER',
          text: 'لا تشارك هذا الرمز مع أي شخص آخر.',
        },
        {
          type: 'BUTTONS',
          buttons: [
            {
              type: 'OTP',
              otp_type: 'COPY_CODE',
              text: 'نسخ رمز التحقق',
            },
          ],
        },
      ],
    };

    it('should correctly build body and button index 0 payloads when otpCode is provided', () => {
      const result = builder.validateAndBuild(authTemplate, {
        to: '966558656690',
        otpCode: '849201',
      });

      expect(result.components).toEqual([
        {
          type: 'body',
          parameters: [{ type: 'text', text: '849201' }],
        },
        {
          type: 'button',
          sub_type: 'url',
          index: '0',
          parameters: [{ type: 'text', text: '849201' }],
        },
      ]);
      expect(result.renderedPreview).toContain('849201');
      expect(result.renderedPreview).toContain('نسخ رمز التحقق');
    });

    it('should extract otpCode from bodyParameters[0] if otpCode field is omitted', () => {
      const result = builder.validateAndBuild(authTemplate, {
        to: '966558656690',
        bodyParameters: ['123456'],
      });

      expect(result.components).toEqual([
        {
          type: 'body',
          parameters: [{ type: 'text', text: '123456' }],
        },
        {
          type: 'button',
          sub_type: 'url',
          index: '0',
          parameters: [{ type: 'text', text: '123456' }],
        },
      ]);
    });

    it('should throw TEMPLATE_PARAMETERS_MISSING when OTP code is not provided', () => {
      expect(() => {
        builder.validateAndBuild(authTemplate, {
          to: '966558656690',
          bodyParameters: [],
        });
      }).toThrow(BadRequestException);

      try {
        builder.validateAndBuild(authTemplate, { to: '966558656690' });
      } catch (e: any) {
        expect(e.getResponse().code).toBe('TEMPLATE_PARAMETERS_MISSING');
      }
    });
  });

  describe('UTILITY template with dynamic URL button (e.g. competition_registration_confirmation)', () => {
    const utilityTemplate: Partial<WhatsAppTemplate> = {
      name: 'competition_registration_confirmation',
      category: 'UTILITY',
      language: 'ar',
      components: [
        {
          type: 'BODY',
          text: 'مرحباً {{1}}، تم تأكيد تسجيلك في المسابقة! رقم المشترك الخاص بك هو {{2}}.',
        },
        {
          type: 'BUTTONS',
          buttons: [
            {
              type: 'URL',
              text: 'رابط الدعوة الخاص بك',
              url: 'https://competition.mkhzin.com/invite/{{1}}',
            },
          ],
        },
      ],
    };

    it('should build body parameters and button index 0 URL parameter correctly', () => {
      const result = builder.validateAndBuild(utilityTemplate, {
        to: '966558656690',
        bodyParameters: ['محمد', '1048'],
        buttonParameters: ['invite-code-999'],
      });

      expect(result.components).toEqual([
        {
          type: 'body',
          parameters: [
            { type: 'text', text: 'محمد' },
            { type: 'text', text: '1048' },
          ],
        },
        {
          type: 'button',
          sub_type: 'url',
          index: '0',
          parameters: [
            { type: 'text', text: 'invite-code-999' },
          ],
        },
      ]);

      expect(result.renderedPreview).toContain('محمد');
      expect(result.renderedPreview).toContain('1048');
      expect(result.renderedPreview).toContain('https://competition.mkhzin.com/invite/invite-code-999');
    });

    it('should support buttonParameters as object array [{ index: 0, text: ... }]', () => {
      const result = builder.validateAndBuild(utilityTemplate, {
        to: '966558656690',
        bodyParameters: ['سارة', '2050'],
        buttonParameters: [{ index: 0, text: 'sarah-link' }],
      });

      expect(result.components[1]).toEqual({
        type: 'button',
        sub_type: 'url',
        index: '0',
        parameters: [{ type: 'text', text: 'sarah-link' }],
      });
    });

    it('should throw TEMPLATE_PARAMETERS_MISSING if dynamic button parameter is missing', () => {
      try {
        builder.validateAndBuild(utilityTemplate, {
          to: '966558656690',
          bodyParameters: ['محمد', '1048'],
          // buttonParameters omitted
        });
        fail('Should have thrown BadRequestException');
      } catch (e: any) {
        expect(e).toBeInstanceOf(BadRequestException);
        expect(e.getResponse().code).toBe('TEMPLATE_PARAMETERS_MISSING');
        expect(e.getResponse().message).toContain('زر');
      }
    });

    it('should throw TEMPLATE_PARAMETERS_MISSING if body parameters are insufficient', () => {
      try {
        builder.validateAndBuild(utilityTemplate, {
          to: '966558656690',
          bodyParameters: ['محمد'], // missing {{2}}
          buttonParameters: ['invite-code-999'],
        });
        fail('Should have thrown BadRequestException');
      } catch (e: any) {
        expect(e).toBeInstanceOf(BadRequestException);
        expect(e.getResponse().code).toBe('TEMPLATE_PARAMETERS_MISSING');
      }
    });
  });

  describe('Header parameters and Media handling', () => {
    it('should validate and build text header parameters', () => {
      const headerTemplate: Partial<WhatsAppTemplate> = {
        name: 'header_notice',
        category: 'MARKETING',
        components: [
          {
            type: 'HEADER',
            format: 'TEXT',
            text: 'عرض خاص لـ {{1}}!',
          },
          {
            type: 'BODY',
            text: 'تفاصيل العرض هنا...',
          },
        ],
      };

      const result = builder.validateAndBuild(headerTemplate, {
        to: '966558656690',
        headerParameters: ['عميلنا المميز'],
      });

      expect(result.components).toEqual([
        {
          type: 'header',
          parameters: [{ type: 'text', text: 'عميلنا المميز' }],
        },
      ]);
    });

    it('should validate and build image header parameter', () => {
      const mediaTemplate: Partial<WhatsAppTemplate> = {
        name: 'media_notice',
        category: 'MARKETING',
        components: [
          {
            type: 'HEADER',
            format: 'IMAGE',
          },
          {
            type: 'BODY',
            text: 'شاهد الصورة أعلاه.',
          },
        ],
      };

      const result = builder.validateAndBuild(mediaTemplate, {
        to: '966558656690',
        headerMedia: { link: 'https://example.com/banner.png' },
      });

      expect(result.components).toEqual([
        {
          type: 'header',
          parameters: [{ type: 'image', image: { link: 'https://example.com/banner.png' } }],
        },
      ]);
    });

    it('should throw if header media is missing', () => {
      const mediaTemplate: Partial<WhatsAppTemplate> = {
        name: 'media_notice',
        components: [{ type: 'HEADER', format: 'IMAGE' }],
      };

      expect(() => {
        builder.validateAndBuild(mediaTemplate, { to: '966558656690' });
      }).toThrow(BadRequestException);
    });
  });

  describe('Custom components override', () => {
    it('should bypass builder when components array is explicitly provided', () => {
      const customComponents = [
        { type: 'body', parameters: [{ type: 'text', text: 'custom' }] },
      ];

      const result = builder.validateAndBuild(
        { name: 'any_template', components: [] },
        { to: '966558656690', components: customComponents },
      );

      expect(result.components).toBe(customComponents);
    });
  });
});
