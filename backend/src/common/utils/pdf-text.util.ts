import bidiFactory from 'bidi-js';

const bidi = bidiFactory();
const arabic = /\p{Script=Arabic}/u;
const directionalControls = /[\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/g;
const graphemes = new Intl.Segmenter('ar', { granularity: 'grapheme' });

function visualRuns(text: string): string[] {
  const levels = bidi.getEmbeddingLevels(
    text,
    arabic.test(text) ? 'rtl' : 'ltr',
  );
  const mirrored = bidi.getMirroredCharactersMap(text, levels.levels);
  const indices = bidi.getReorderedIndices(text, levels);

  const runs: string[] = [];
  for (let offset = 0; offset < indices.length; ) {
    const start = indices[offset];
    const level = levels.levels[start];
    const step = level % 2 ? -1 : 1;
    let end = offset + 1;
    while (
      end < indices.length &&
      levels.levels[indices[end]] === level &&
      indices[end] === indices[end - 1] + step
    )
      end += 1;
    const logicalStart = Math.min(start, indices[end - 1]);
    const logicalEnd = Math.max(start, indices[end - 1]);
    let run = '';
    for (let index = logicalStart; index <= logicalEnd; index += 1) {
      run += mirrored.get(index) ?? text[index];
    }
    run = run.replace(directionalControls, '');
    // Fontkit shapes and reverses Arabic runs; neutral-only RTL runs need visual ordering here.
    if (level % 2 && !arabic.test(run))
      run = Array.from(run).reverse().join('');
    if (run) runs.push(run);
    offset = end;
  }
  return runs;
}

export function drawPdfText(
  doc: PDFKit.PDFDocument,
  value: string | null | undefined,
  x: number,
  y: number,
  options: {
    width: number;
    align?: 'left' | 'right' | 'center';
    ellipsis?: boolean;
  },
): void {
  const text = String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  const measure = (input: string) =>
    visualRuns(input).map((run) => ({
      text: run,
      // An explicit feature list prevents PDFKit from laying out each space-separated word independently.
      width: doc.widthOfString(run, { features: [] }),
    }));
  let runs = measure(text);
  let width = runs.reduce((sum, run) => sum + run.width, 0);
  if (width > options.width) {
    const parts = Array.from(graphemes.segment(text), ({ segment }) => segment);
    const suffix = options.ellipsis ? '\u2026' : '';
    let low = 0;
    let high = parts.length;
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      const candidate = measure(
        parts.slice(0, middle).join('').trimEnd() + suffix,
      );
      if (candidate.reduce((sum, run) => sum + run.width, 0) <= options.width)
        low = middle;
      else high = middle - 1;
    }
    runs = measure(parts.slice(0, low).join('').trimEnd() + suffix);
    width = runs.reduce((sum, run) => sum + run.width, 0);
  }
  const align = options.align ?? 'right';
  let cursor =
    x +
    (align === 'right'
      ? options.width - width
      : align === 'center'
        ? (options.width - width) / 2
        : 0);
  for (const run of runs) {
    doc.text(run.text, cursor, y, { lineBreak: false, features: [] });
    cursor += run.width;
  }
}
