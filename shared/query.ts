/**
 * Query normalization for address search.
 *
 * Pure, no DOM or runtime deps — safe to import from both the Workers runtime
 * and the browser bundle.
 */

/** Cap on returned search results. */
export const SEARCH_LIMIT = 20;

// Digit folding maps — Arabic-Indic and Persian forms normalized to Western.
const ARABIC_DIGITS = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
const PERSIAN_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
const WESTERN_DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

/**
 * Fold Arabic-Indic and Persian digits to Western, replace the Arabic comma
 * (U+060C) with a space, and collapse runs of whitespace.
 */
export function normalizeDigits(input: string): string {
  let out = input;
  for (let i = 0; i < 10; i++) {
    out = out.split(ARABIC_DIGITS[i]!).join(WESTERN_DIGITS[i]!);
    out = out.split(PERSIAN_DIGITS[i]!).join(WESTERN_DIGITS[i]!);
  }
  out = out.replace(/\u060C/g, ' '); // Arabic comma → space
  return out.replace(/\s+/gu, ' ').trim();
}

/**
 * Turn a raw query into the normalized search words: split on
 * whitespace/commas, extract numbers from glued shorthand tokens
 * (e.g. "ط4133" → "4133"), keep pure numbers and multi-char words, drop bare
 * single letters (ambiguous shorthands like م/ط/b).
 *
 * @returns unique, ordered words
 */
export function wordsOf(query: string): string[] {
  const text = normalizeDigits(query);
  if (text === '') return [];

  const tokens = text.split(/[\s,]+/u).filter((t) => t.length > 0);
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (w: string): void => {
    if (!seen.has(w)) {
      seen.add(w);
      out.push(w);
    }
  };

  for (const raw of tokens) {
    const token = raw.trim();
    if (token === '') continue;

    // Pure number, optionally with a trailing letter (e.g. "2560D").
    if (/^[0-9]+[a-z]?$/i.test(token)) {
      push(token);
      continue;
    }
    // Glued shorthand like "ط4133", "م241", "b9999": keep the number.
    const match = token.match(/^[^0-9]*([0-9]+[a-z]?)$/i);
    if (match) {
      push(match[1]!);
      continue;
    }
    // Multi-char words (area names, "building", etc.). Bare single letters are
    // dropped — they're ambiguous shorthand noise.
    const len = [...token].length; // code-point length, for Arabic
    if (len >= 2) push(token);
  }
  return out;
}
