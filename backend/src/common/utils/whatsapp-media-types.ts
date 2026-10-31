const MB = 1024 * 1024;

export type WhatsAppMediaKind = 'image' | 'video' | 'audio' | 'document';

/** WhatsApp Cloud API supported media, with Meta's size limits. */
export const WHATSAPP_MEDIA_TYPES: Record<string, { type: WhatsAppMediaKind; ext: string; max: number }> = {
  'image/jpeg': { type: 'image', ext: '.jpg', max: 5 * MB },
  'image/png': { type: 'image', ext: '.png', max: 5 * MB },
  'video/mp4': { type: 'video', ext: '.mp4', max: 16 * MB },
  'video/3gpp': { type: 'video', ext: '.3gp', max: 16 * MB },
  'audio/aac': { type: 'audio', ext: '.aac', max: 16 * MB },
  'audio/mp4': { type: 'audio', ext: '.m4a', max: 16 * MB },
  'audio/mpeg': { type: 'audio', ext: '.mp3', max: 16 * MB },
  'audio/amr': { type: 'audio', ext: '.amr', max: 16 * MB },
  'audio/ogg': { type: 'audio', ext: '.ogg', max: 16 * MB },
  'application/pdf': { type: 'document', ext: '.pdf', max: 16 * MB },
  'application/msword': { type: 'document', ext: '.doc', max: 16 * MB },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': { type: 'document', ext: '.docx', max: 16 * MB },
  'application/vnd.ms-excel': { type: 'document', ext: '.xls', max: 16 * MB },
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': { type: 'document', ext: '.xlsx', max: 16 * MB },
  'application/vnd.ms-powerpoint': { type: 'document', ext: '.ppt', max: 16 * MB },
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': { type: 'document', ext: '.pptx', max: 16 * MB },
  'text/plain': { type: 'document', ext: '.txt', max: 16 * MB },
};

export const WHATSAPP_MEDIA_UNSUPPORTED = 'نوع الملف غير مدعوم في واتساب. المسموح: صور JPG/PNG، فيديو MP4، صوت MP3/AAC/OGG، ومستندات PDF/Word/Excel/PowerPoint.';
