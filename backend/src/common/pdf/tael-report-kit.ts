import { join } from 'node:path';
import type { Response } from 'express';
import PDFDocument from 'pdfkit';
import { drawPdfText } from '../utils/pdf-text.util';

/**
 * The Tael Bot report look (as in the customer statistics PDF): landscape A4, a brand gradient band with the
 * glyph, white cards on a lilac page, and a footer with page numbers. Reports draw their content with these parts.
 */

export const REPORT_COLORS = {
  page: '#FBF9FD',
  ink: '#241B2E',
  plum: '#38204A',
  plumDeep: '#24142F',
  brand: '#643B89',
  lilac: '#B48CD6',
  lavender: '#DCCCE8',
  muted: '#776E80',
  line: '#E7E0EE',
  soft: '#F4EEF9',
  zebra: '#F9F6FC',
  teal: '#14806F',
  orange: '#D9622B',
  red: '#C2413A',
  white: '#FFFFFF',
};

export const PAGE_MARGIN = 36;

// Tael Bot glyph (frontend/src/assets/logos/tael-bot-glyph-white.svg), drawn as vectors so it stays sharp in print.
const GLYPH_VIEWBOX = { x: 236.8, y: 347.55, size: 1602 };
const GLYPH_PATH = 'M741.99 622.3l710.58 0c201.36,0 366.1,164.91 366.1,366.47l0 327.68c0,114.99 -64.35,215.66 -158.78,267.73l-552.03 319.03c-3.88,2.24 -8.32,2.24 -12.2,0 -3.88,-2.24 -6.1,-6.09 -6.1,-10.58l0 -251.32c0,-4.49 2.22,-8.34 6.1,-10.58l425.01 -245.62c47.38,-31.87 78.72,-86 78.72,-147.12l0 -228.45c0,-97.42 -79.63,-177.12 -176.95,-177.12l-683.11 0c-6.71,0 -12.2,5.5 -12.2,12.22l0 393.36c0,97.42 79.63,177.13 176.95,177.13l173.27 0c6.72,0 12.2,5.49 12.2,12.22l0 182.3c0,6.73 -5.48,12.22 -12.2,12.22l-201.14 0c-201.36,0 -366.1,-164.91 -366.1,-366.47l0 -851.59c0,-6.73 5.48,-12.22 12.2,-12.22l195.25 0c6.72,0 12.2,5.49 12.2,12.22l0 206.31c0,6.73 5.48,12.22 12.2,12.22z';
const GLYPH_DOTS = [[1217.53, 1015.14], [892, 1015.14], [256.95, 618.74]];

export const formatNumber = (value: number) => value.toLocaleString('en');
export const formatPercent = (value: number, total: number) => (total ? `${Math.round((value / total) * 100)}%` : '—');

export type ReportText = (value: string, x: number, y: number, boxWidth: number, options: { size: number; color: string; bold?: boolean; align?: 'left' | 'right' | 'center' }) => void;
export type ReportCard = { label: string; value: string; note: string; color: string; hero?: boolean };

/** Starts a landscape A4 PDF download on `response` and returns the drawing helpers. */
export function createTaelReport(response: Response, filename: string) {
  response.setHeader('Content-Type', 'application/pdf');
  response.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margins: { top: 0, bottom: 0, left: 0, right: 0 }, bufferPages: true });
  doc.pipe(response);
  doc.registerFont('ArabicRegular', join(process.cwd(), 'assets', 'fonts', 'Tajarib-Regular.otf'));
  doc.registerFont('ArabicBold', join(process.cwd(), 'assets', 'fonts', 'Tajarib-Bold.otf'));

  const width = doc.page.width;
  const height = doc.page.height;
  const contentWidth = width - PAGE_MARGIN * 2;
  const right = width - PAGE_MARGIN;
  const C = REPORT_COLORS;

  // Long labels shrink to fit (down to 6pt) instead of being cut: the Arabic fonts have no ellipsis glyph.
  // The fonts have no underscore or emoji either, so those are dropped ("offers_26_10" reads "offers 26 10").
  const text: ReportText = (raw, x, y, boxWidth, options) => {
    const value = raw.replace(/_/g, ' ').replace(/[\p{Extended_Pictographic}️‍]/gu, '').replace(/\s+/g, ' ').trim();
    doc.font(options.bold ? 'ArabicBold' : 'ArabicRegular').fillColor(options.color);
    let size = options.size;
    while (size > 6 && doc.fontSize(size).widthOfString(value, { features: [] }) > boxWidth) size -= 0.5;
    const shrink = options.size - size;
    drawPdfText(doc.fontSize(size), value, x, y + shrink * 0.4, { width: boxWidth, align: options.align, ellipsis: true });
  };

  const glyph = (x: number, y: number, size: number, color: string) => {
    doc.save();
    doc.translate(x, y).scale(size / GLYPH_VIEWBOX.size).translate(-GLYPH_VIEWBOX.x, -GLYPH_VIEWBOX.y);
    doc.path(GLYPH_PATH).fill(color, 'even-odd');
    for (const [dotX, dotY] of GLYPH_DOTS) doc.roundedRect(dotX, dotY, 217.02, 217.24, 12.2).fill(color);
    doc.restore();
  };

  /** A new page (or the first one) painted, with the brand band, logo and title. */
  const page = (options: { bandHeight: number; title: string; titleY: number; titleSize: number; glyphSize: number; first?: boolean }) => {
    if (!options.first) doc.addPage();
    doc.rect(0, 0, width, height).fill(C.page);
    const gradient = doc.linearGradient(0, 0, width, options.bandHeight);
    gradient.stop(0, C.brand).stop(1, C.plumDeep);
    doc.rect(0, 0, width, options.bandHeight).fill(gradient);
    doc.save().fillOpacity(0.07);
    doc.circle(70, options.bandHeight + 10, 95).fill(C.white);
    doc.circle(210, -30, 70).fill(C.white);
    doc.restore();
    const brandY = Math.max(16, (options.titleY - options.glyphSize) / 2);
    glyph(right - options.glyphSize, brandY, options.glyphSize, C.white);
    text('تيل بوت', right - options.glyphSize - 160, brandY + options.glyphSize * 0.08, 148, { size: options.glyphSize * 0.4, color: C.white, bold: true });
    text('Tael Bot', right - options.glyphSize - 160, brandY + options.glyphSize * 0.58, 148, { size: options.glyphSize * 0.2, color: C.lavender });
    // Below the logo when the band has room, otherwise beside it.
    const titleEnd = options.titleY >= brandY + options.glyphSize ? right : right - options.glyphSize - 110;
    text(options.title, titleEnd - 420, options.titleY, 420, { size: options.titleSize, color: C.white, bold: true });
  };

  const chip = (x: number, y: number, chipWidth: number, label: string, value: string) => {
    doc.save().fillOpacity(0.12).roundedRect(x, y, chipWidth, 38, 9).fill(C.white).restore();
    text(label, x + 10, y + 7, chipWidth - 20, { size: 7, color: C.lavender });
    text(value, x + 10, y + 19, chipWidth - 20, { size: 10, color: C.white, bold: true });
  };

  /** A row of KPI cards, right to left; the hero card is filled with the brand gradient. */
  const cards = (items: ReportCard[], y: number, cardHeight: number) => {
    const gap = 10;
    const cardWidth = (contentWidth - gap * (items.length - 1)) / items.length;
    items.forEach((card, index) => {
      const x = right - cardWidth - index * (cardWidth + gap);
      if (card.hero) {
        const gradient = doc.linearGradient(x, y, x + cardWidth, y + cardHeight);
        gradient.stop(0, C.brand).stop(1, C.plum);
        doc.roundedRect(x, y, cardWidth, cardHeight, 11).fill(gradient);
      } else {
        doc.roundedRect(x, y, cardWidth, cardHeight, 11).lineWidth(0.8).fillAndStroke(C.white, C.line);
        doc.roundedRect(x + cardWidth - 5, y + 16, 3, cardHeight - 32, 1.5).fill(card.color);
      }
      text(card.label, x + 10, y + 13, cardWidth - 22, { size: 7.5, color: card.hero ? C.lavender : C.muted, bold: true });
      text(card.value, x + 10, y + 31, cardWidth - 22, { size: cardWidth < 110 ? 15 : 18, color: card.hero ? C.white : C.ink, bold: true });
      text(card.note, x + 10, y + cardHeight - 22, cardWidth - 22, { size: 6.8, color: card.hero ? C.lavender : C.muted });
    });
  };

  /** A white panel with its title; returns the y where its content starts. */
  const panel = (x: number, y: number, panelWidth: number, panelHeight: number, title: string, note?: string) => {
    doc.roundedRect(x, y, panelWidth, panelHeight, 12).lineWidth(0.8).fillAndStroke(C.white, C.line);
    text(title, x + 16, y + 14, panelWidth - 32, { size: 12, color: C.plum, bold: true });
    if (note) text(note, x + 16, y + 17, panelWidth / 2 - 16, { size: 7.5, color: C.muted, align: 'left' });
    return y + 42;
  };

  /** Footer on every page: page number, site and report label. */
  const finish = (label: string) => {
    const pages = doc.bufferedPageRange();
    for (let index = 0; index < pages.count; index += 1) {
      doc.switchToPage(index);
      doc.moveTo(PAGE_MARGIN, height - 30).lineTo(right, height - 30).lineWidth(0.5).stroke(C.line);
      text(`${index + 1} / ${pages.count}`, PAGE_MARGIN, height - 22, contentWidth, { size: 7.5, color: C.muted, align: 'center' });
      text('taelbot.com', PAGE_MARGIN, height - 22, 120, { size: 7.5, color: C.muted, align: 'left' });
      text(label, right - 200, height - 22, 200, { size: 7.5, color: C.muted });
    }
    doc.end();
  };

  return { doc, width, height, right, contentWidth, text, page, chip, cards, panel, finish };
}
