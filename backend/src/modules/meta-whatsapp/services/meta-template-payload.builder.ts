import { Injectable, BadRequestException } from '@nestjs/common';
import { WhatsAppTemplate } from '../entities/whatsapp-template.entity';
import { SendWhatsAppTemplateDto } from '../dto/meta-whatsapp.dto';

export interface DynamicButtonRequirement {
  index: number;
  type: 'URL' | 'QUICK_REPLY' | 'OTP' | 'COPY_CODE';
  text?: string;
  url?: string;
  hasUrlPlaceholder: boolean;
  isCopyCode: boolean;
}

export interface TemplateAnalysis {
  isAuthentication: boolean;
  headerType?: 'TEXT' | 'IMAGE' | 'DOCUMENT' | 'VIDEO' | 'LOCATION';
  headerPlaceholderCount: number;
  headerMediaRequired: boolean;
  bodyPlaceholderCount: number;
  dynamicButtons: DynamicButtonRequirement[];
}

export interface BuildResult {
  components: Array<Record<string, any>>;
  renderedPreview: string;
}

@Injectable()
export class MetaTemplatePayloadBuilder {
  /**
   * Analyze template components to identify all requirements:
   * Header placeholders / media, Body placeholders, Dynamic buttons, OTP.
   */
  analyzeTemplateRequirements(components: any[] = [], category?: string | null): TemplateAnalysis {
    const isCategoryAuth = String(category || '').toUpperCase() === 'AUTHENTICATION';

    let headerType: 'TEXT' | 'IMAGE' | 'DOCUMENT' | 'VIDEO' | 'LOCATION' | undefined;
    let headerPlaceholderCount = 0;
    let headerMediaRequired = false;
    let bodyPlaceholderCount = 0;
    const dynamicButtons: DynamicButtonRequirement[] = [];
    let hasOtpButton = false;

    for (const comp of components || []) {
      const type = String(comp.type || '').toUpperCase();

      if (type === 'HEADER') {
        const format = String(comp.format || 'TEXT').toUpperCase() as any;
        headerType = format;
        if (format === 'TEXT') {
          headerPlaceholderCount = this.countPlaceholders(comp.text);
        } else if (['IMAGE', 'DOCUMENT', 'VIDEO'].includes(format)) {
          headerMediaRequired = true;
        }
      } else if (type === 'BODY') {
        bodyPlaceholderCount = this.countPlaceholders(comp.text);
      } else if (type === 'BUTTONS' && Array.isArray(comp.buttons)) {
        comp.buttons.forEach((btn: any, index: number) => {
          const btnType = String(btn.type || '').toUpperCase();
          const otpType = String(btn.otp_type || '').toUpperCase();
          const hasUrlPlaceholder = btnType === 'URL' && /\{\{\d+\}\}/.test(btn.url || '');
          const isCopyCode = otpType === 'COPY_CODE' || btnType === 'OTP' || btnType === 'COPY_CODE';

          if (isCopyCode) {
            hasOtpButton = true;
          }

          if (hasUrlPlaceholder || isCopyCode) {
            dynamicButtons.push({
              index,
              type: isCopyCode ? 'COPY_CODE' : (btnType as any),
              text: btn.text,
              url: btn.url,
              hasUrlPlaceholder,
              isCopyCode,
            });
          }
        });
      }
    }

    const isAuthentication = isCategoryAuth || hasOtpButton;

    return {
      isAuthentication,
      headerType,
      headerPlaceholderCount,
      headerMediaRequired,
      bodyPlaceholderCount,
      dynamicButtons,
    };
  }

  /**
   * Validates parameters and constructs the Meta Graph API payload components.
   * Throws BadRequestException (code: TEMPLATE_PARAMETERS_MISSING) before sending to Meta
   * if any required parameter is missing.
   */
  validateAndBuild(
    template: Partial<WhatsAppTemplate>,
    dto: Partial<SendWhatsAppTemplateDto>,
  ): BuildResult {
    // If raw custom components are explicitly provided by the caller, use them
    if (dto.components && Array.isArray(dto.components) && dto.components.length > 0) {
      return {
        components: dto.components,
        renderedPreview: this.renderTemplatePreview(template, dto),
      };
    }

    const analysis = this.analyzeTemplateRequirements(template.components || [], template.category);
    const components: Array<Record<string, any>> = [];

    // ==========================================
    // 1. AUTHENTICATION TEMPLATE (e.g. OTP)
    // ==========================================
    if (analysis.isAuthentication) {
      const otpCode = this.extractOtpCode(dto);

      if (!otpCode || !otpCode.trim()) {
        throw new BadRequestException({
          code: 'TEMPLATE_PARAMETERS_MISSING',
          message: 'رمز التحقق (OTP) مطلوب لقالب تسجيل الدخول / التحقق.',
          details: 'Missing required OTP code for authentication template',
        });
      }

      const cleanOtp = otpCode.trim();

      // Meta Cloud API v26.0 specification for copy_code OTP templates:
      // 1. Body parameter with OTP code
      components.push({
        type: 'body',
        parameters: [
          {
            type: 'text',
            text: cleanOtp,
          },
        ],
      });

      // 2. Button parameter (index 0, sub_type url) with OTP code
      components.push({
        type: 'button',
        sub_type: 'url',
        index: '0',
        parameters: [
          {
            type: 'text',
            text: cleanOtp,
          },
        ],
      });

      return {
        components,
        renderedPreview: this.renderAuthPreview(template, cleanOtp),
      };
    }

    // ==========================================
    // 2. NON-AUTHENTICATION TEMPLATES (HEADER, BODY, BUTTONS)
    // ==========================================

    // HEADER Validation & Construction
    if (analysis.headerType === 'TEXT' && analysis.headerPlaceholderCount > 0) {
      const headerParams = dto.headerParameters || [];
      if (headerParams.length < analysis.headerPlaceholderCount) {
        throw new BadRequestException({
          code: 'TEMPLATE_PARAMETERS_MISSING',
          message: `مطلوب ${analysis.headerPlaceholderCount} متغير(ات) لترويسة القالب (HEADER). المتوفر: ${headerParams.length}.`,
          details: `Missing header parameters. Required: ${analysis.headerPlaceholderCount}, provided: ${headerParams.length}`,
        });
      }

      for (let i = 0; i < analysis.headerPlaceholderCount; i++) {
        if (headerParams[i] === undefined || headerParams[i] === null || String(headerParams[i]).trim() === '') {
          throw new BadRequestException({
            code: 'TEMPLATE_PARAMETERS_MISSING',
            message: `متغير ترويسة القالب رقم {{${i + 1}}} مطلوب ولا يمكن تركه فارغاً.`,
            details: `Empty header parameter at index ${i}`,
          });
        }
      }

      components.push({
        type: 'header',
        parameters: headerParams.slice(0, analysis.headerPlaceholderCount).map((text) => ({
          type: 'text',
          text: String(text),
        })),
      });
    } else if (analysis.headerMediaRequired && analysis.headerType) {
      const media = dto.headerMedia;
      if (!media || (!media.link && !media.id)) {
        throw new BadRequestException({
          code: 'TEMPLATE_PARAMETERS_MISSING',
          message: `مطلوب وسائط (رابط أو معرف) لترويسة القالب من نوع ${analysis.headerType}.`,
          details: `Missing header media for format: ${analysis.headerType}`,
        });
      }

      const mediaType = analysis.headerType.toLowerCase();
      const mediaObj: Record<string, any> = {};
      if (media.link) mediaObj.link = media.link;
      if (media.id) mediaObj.id = media.id;

      components.push({
        type: 'header',
        parameters: [
          {
            type: mediaType,
            [mediaType]: mediaObj,
          },
        ],
      });
    }

    // BODY Validation & Construction
    if (analysis.bodyPlaceholderCount > 0) {
      const bodyParams = dto.bodyParameters || [];
      if (bodyParams.length < analysis.bodyPlaceholderCount) {
        throw new BadRequestException({
          code: 'TEMPLATE_PARAMETERS_MISSING',
          message: `مطلوب ${analysis.bodyPlaceholderCount} متغير(ات) لنص الرسالة (BODY). المتوفر: ${bodyParams.length}.`,
          details: `Missing body parameters. Required: ${analysis.bodyPlaceholderCount}, provided: ${bodyParams.length}`,
        });
      }

      for (let i = 0; i < analysis.bodyPlaceholderCount; i++) {
        if (bodyParams[i] === undefined || bodyParams[i] === null || String(bodyParams[i]).trim() === '') {
          throw new BadRequestException({
            code: 'TEMPLATE_PARAMETERS_MISSING',
            message: `متغير نص الرسالة رقم {{${i + 1}}} مطلوب ولا يمكن تركه فارغاً.`,
            details: `Empty body parameter at index ${i}`,
          });
        }
      }

      components.push({
        type: 'body',
        parameters: bodyParams.slice(0, analysis.bodyPlaceholderCount).map((text) => ({
          type: 'text',
          text: String(text),
        })),
      });
    }

    // DYNAMIC BUTTONS Validation & Construction
    for (const btnReq of analysis.dynamicButtons) {
      const btnValue = this.extractButtonValue(dto, btnReq.index);

      if (!btnValue || !String(btnValue).trim()) {
        const btnLabel = btnReq.text ? `"${btnReq.text}"` : `رقم ${btnReq.index + 1}`;
        throw new BadRequestException({
          code: 'TEMPLATE_PARAMETERS_MISSING',
          message: `مطلوب قيمة للمتغير الخاص بالزر ${btnLabel} (Index ${btnReq.index}). الرابط يحتوي على متغير ديناميكي.`,
          details: `Missing parameter for button index ${btnReq.index}`,
        });
      }

      const cleanVal = String(btnValue).trim();

      if (btnReq.type === 'QUICK_REPLY') {
        components.push({
          type: 'button',
          sub_type: 'quick_reply',
          index: String(btnReq.index),
          parameters: [
            {
              type: 'payload',
              payload: cleanVal,
            },
          ],
        });
      } else {
        // URL button or Copy Code button
        components.push({
          type: 'button',
          sub_type: 'url',
          index: String(btnReq.index),
          parameters: [
            {
              type: 'text',
              text: cleanVal,
            },
          ],
        });
      }
    }

    const renderedPreview = this.renderTemplatePreview(template, dto);

    return {
      components,
      renderedPreview,
    };
  }

  private countPlaceholders(text?: string): number {
    if (!text) return 0;
    const matches = [...text.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1]));
    return matches.length ? Math.max(...matches) : 0;
  }

  private extractOtpCode(dto: Partial<SendWhatsAppTemplateDto>): string | null {
    if (dto.otpCode && String(dto.otpCode).trim()) {
      return String(dto.otpCode).trim();
    }
    if (dto.bodyParameters && dto.bodyParameters.length > 0 && String(dto.bodyParameters[0]).trim()) {
      return String(dto.bodyParameters[0]).trim();
    }
    if (Array.isArray(dto.buttonParameters) && dto.buttonParameters.length > 0) {
      const first = dto.buttonParameters[0];
      if (typeof first === 'string' && first.trim()) return first.trim();
      if (typeof first === 'object' && first?.text && String(first.text).trim()) return String(first.text).trim();
    }
    return null;
  }

  private extractButtonValue(dto: Partial<SendWhatsAppTemplateDto>, index: number): string | null {
    const list = dto.buttonParameters;
    if (!list || !Array.isArray(list)) return null;

    // Check by object { index: number, text?: string, payload?: string }
    const matchObj = list.find((item: any) => item && typeof item === 'object' && (item.index === index || item.index === String(index)));
    if (matchObj) {
      return matchObj.text || matchObj.payload || null;
    }

    // Check by array index
    const atIndex = list[index];
    if (typeof atIndex === 'string') return atIndex;
    if (typeof atIndex === 'object' && atIndex) return atIndex.text || atIndex.payload || null;

    return null;
  }

  private renderAuthPreview(template: Partial<WhatsAppTemplate>, otpCode: string): string {
    const bodyComp = (template.components || []).find((c: any) => String(c.type).toUpperCase() === 'BODY');
    const footerComp = (template.components || []).find((c: any) => String(c.type).toUpperCase() === 'FOOTER');

    let bodyText = bodyComp?.text || `رمز الأمان الخاص بك هو {{1}}.`;
    bodyText = bodyText.replace(/\{\{1\}\}/g, otpCode);

    const parts = [bodyText];
    if (footerComp?.text) parts.push(footerComp.text);
    parts.push(`[زر: نسخ رمز التحقق (${otpCode})]`);

    return parts.join('\n\n');
  }

  private renderTemplatePreview(template: Partial<WhatsAppTemplate>, dto: Partial<SendWhatsAppTemplateDto>): string {
    const headerComp = (template.components || []).find((c: any) => String(c.type).toUpperCase() === 'HEADER');
    const bodyComp = (template.components || []).find((c: any) => String(c.type).toUpperCase() === 'BODY');
    const footerComp = (template.components || []).find((c: any) => String(c.type).toUpperCase() === 'FOOTER');
    const buttonsComp = (template.components || []).find((c: any) => String(c.type).toUpperCase() === 'BUTTONS');

    const parts: string[] = [];

    if (headerComp?.text) {
      let headerText = headerComp.text;
      (dto.headerParameters || []).forEach((val, i) => {
        headerText = headerText.split(`{{${i + 1}}}`).join(val || `{{${i + 1}}}`);
      });
      parts.push(headerText);
    } else if (dto.headerMedia?.link) {
      parts.push(`[وسائط ترويسة: ${dto.headerMedia.link}]`);
    }

    if (bodyComp?.text) {
      let bodyText = bodyComp.text;
      (dto.bodyParameters || []).forEach((val, i) => {
        bodyText = bodyText.split(`{{${i + 1}}}`).join(val || `{{${i + 1}}}`);
      });
      parts.push(bodyText);
    } else {
      parts.push(template.name || 'قالب واتساب');
    }

    if (footerComp?.text) {
      parts.push(footerComp.text);
    }

    if (buttonsComp?.buttons?.length) {
      const btnLines = buttonsComp.buttons.map((btn: any, i: number) => {
        let btnUrl = btn.url || '';
        const btnVal = this.extractButtonValue(dto, i);
        if (btnVal && btnUrl.includes('{{1}}')) {
          btnUrl = btnUrl.replace(/\{\{1\}\}/g, btnVal);
        }
        return `[زر: ${btn.text || ''}${btnUrl ? ` -> ${btnUrl}` : ''}]`;
      });
      parts.push(btnLines.join(' '));
    }

    return parts.join('\n\n');
  }
}
