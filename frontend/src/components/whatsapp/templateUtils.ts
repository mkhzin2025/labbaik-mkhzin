export type TemplateButton = { type: string; text?: string; url?: string; phone_number?: string; otp_type?: string; example?: string[] };
/** Meta's sample values, submitted with the template for review. */
export type TemplateExample = { header_text?: string[]; header_handle?: string[]; body_text?: string[][] };
export type TemplateComponent = { type: string; text?: string; format?: string; buttons?: TemplateButton[]; example?: TemplateExample };
export type Template = { id: string; name: string; language: string; category?: string; status?: string; components: TemplateComponent[] };
export type HeaderFormat = 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT' | 'LOCATION';
export type MediaType = 'image' | 'video' | 'document';

/** Header media as the send API expects it; `file` is our local copy for previews. */
export type HeaderMedia = { id?: string; link?: string; file?: string; mimeType?: string; filename?: string; type?: string };

export type ButtonValue = { index: number; text: string; label: string; url?: string };

export type TemplateValues = {
  header: string[];
  body: string[];
  buttons: ButtonValue[];
  otp: string;
  media: HeaderMedia | null;
  nameFallback: string;
};

export type TemplateAnalysis = {
  isAuth: boolean;
  headerFormat?: HeaderFormat;
  headerText?: string;
  headerVars: number;
  headerExamples: string[];
  mediaType?: MediaType;
  sampleMediaUrl?: string;
  bodyText: string;
  bodyVars: number;
  bodyExamples: string[];
  footerText?: string;
  buttons: TemplateButton[];
  dynamicButtons: ButtonValue[];
};

/** Per-customer tokens the server fills for each recipient of a bulk send. */
export const CUSTOMER_TOKENS = [
  { token: '{{customer.fullName}}', label: 'اسم العميل' },
  { token: '{{customer.phoneNumber}}', label: 'رقم الجوال' },
  { token: '{{customer.branchName}}', label: 'اسم الفرع' },
  { token: '{{customer.email}}', label: 'البريد' },
] as const;

export const DEFAULT_NAME_FALLBACK = 'عميلنا العزيز';

export const MEDIA_LABELS: Record<MediaType, { noun: string; accept: string; maxMb: number }> = {
  image: { noun: 'صورة', accept: 'image/jpeg,image/png', maxMb: 5 },
  video: { noun: 'فيديو', accept: 'video/mp4', maxMb: 16 },
  document: { noun: 'ملف PDF', accept: 'application/pdf', maxMb: 16 },
};

export const CATEGORY_LABELS: Record<string, string> = { MARKETING: 'تسويقي', UTILITY: 'خدمي', AUTHENTICATION: 'تحقق' };

export const isApproved = (t?: Template | null) => String(t?.status).toUpperCase() === 'APPROVED';

const find = (t: Template, type: string) => t.components?.find((c) => String(c.type).toUpperCase() === type);

export function placeholderCount(text?: string) {
  if (!text) return 0;
  const matches = [...text.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1]));
  return matches.length ? Math.max(...matches) : 0;
}

export function isAuthTemplate(t?: Template | null) {
  if (!t) return false;
  if (String(t.category).toUpperCase() === 'AUTHENTICATION') return true;
  return Boolean(t.components?.some((c) => c.buttons?.some((b) => b.otp_type === 'COPY_CODE' || b.type === 'OTP')));
}

export function analyzeTemplate(t: Template): TemplateAnalysis {
  const header = find(t, 'HEADER');
  const body = find(t, 'BODY');
  const footer = find(t, 'FOOTER');
  const buttons = find(t, 'BUTTONS')?.buttons || [];
  const headerFormat = header ? (String(header.format || 'TEXT').toUpperCase() as HeaderFormat) : undefined;
  const mediaType = headerFormat === 'IMAGE' ? 'image' : headerFormat === 'VIDEO' ? 'video' : headerFormat === 'DOCUMENT' ? 'document' : undefined;
  const isAuth = isAuthTemplate(t);
  return {
    isAuth,
    headerFormat,
    headerText: headerFormat === 'TEXT' ? header?.text : undefined,
    headerVars: headerFormat === 'TEXT' ? placeholderCount(header?.text) : 0,
    headerExamples: header?.example?.header_text || [],
    mediaType,
    sampleMediaUrl: header?.example?.header_handle?.[0],
    bodyText: body?.text || t.name,
    bodyVars: placeholderCount(body?.text),
    bodyExamples: body?.example?.body_text?.[0] || [],
    footerText: footer?.text,
    buttons,
    dynamicButtons: isAuth
      ? []
      : buttons
        .map((btn, index) => ({ btn, index }))
        .filter(({ btn }) => String(btn.type).toUpperCase() === 'URL' && /\{\{\d+\}\}/.test(btn.url || ''))
        .map(({ btn, index }) => ({ index, text: '', label: btn.text || `زر رابط ${index + 1}`, url: btn.url })),
  };
}

export function emptyValues(analysis: TemplateAnalysis): TemplateValues {
  return {
    header: Array(analysis.headerVars).fill(''),
    body: Array(analysis.bodyVars).fill(''),
    buttons: analysis.dynamicButtons.map((b) => ({ ...b })),
    otp: '',
    media: null,
    nameFallback: DEFAULT_NAME_FALLBACK,
  };
}

/** What the composer still needs before the template can be sent; empty when ready. */
export function missingValues(analysis: TemplateAnalysis, values: TemplateValues) {
  if (analysis.isAuth) return values.otp.trim() ? [] : ['رمز التحقق'];
  const missing: string[] = [];
  if (analysis.mediaType && !values.media?.id && !values.media?.link) missing.push(MEDIA_LABELS[analysis.mediaType].noun);
  values.header.forEach((v, i) => !v.trim() && missing.push(`متغير العنوان {{${i + 1}}}`));
  values.body.forEach((v, i) => !v.trim() && missing.push(`متغير النص {{${i + 1}}}`));
  values.buttons.forEach((b) => !b.text.trim() && missing.push(`رابط زر «${b.label}»`));
  return missing;
}

export const usesCustomerName = (values: TemplateValues) =>
  [...values.header, ...values.body, ...values.buttons.map((b) => b.text)].some((v) => v.includes('{{customer.fullName}}'));

export const usesCustomerTokens = (values: TemplateValues) =>
  [...values.header, ...values.body, ...values.buttons.map((b) => b.text)].some((v) => /\{\{customer\.\w+\}\}/.test(v));

/** Request body shared by single and bulk sends. */
export function sendPayload(analysis: TemplateAnalysis, values: TemplateValues) {
  if (analysis.isAuth) return { otpCode: values.otp.trim(), bodyParameters: [values.otp.trim()] };
  return {
    bodyParameters: values.body,
    headerParameters: values.header,
    buttonParameters: values.buttons.length ? values.buttons.map((b) => ({ index: b.index, text: b.text })) : undefined,
    headerMedia: values.media || undefined,
  };
}

/** Replaces a value's customer tokens with readable labels, e.g. «اسم العميل». */
export function describeTokens(value: string) {
  return CUSTOMER_TOKENS.reduce((text, item) => text.split(item.token).join(`«${item.label}»`), value);
}
