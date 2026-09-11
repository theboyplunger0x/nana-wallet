import type { ConversationLanguage } from '../conversations/language.js';

/**
 * Agent-facing balance presentation.
 *
 * `get_balance` used to hand the model the wallet provider's raw decimal — e.g.
 * `97.989332609300122852` — and the realtime TTS then read it digit by digit. The
 * model now receives two fields instead:
 *
 *  - `balance`: the amount with EXACTLY two decimals, ready to be repeated verbatim.
 *  - `balanceSpoken`: the same amount written out in words in the conversation
 *    language, so the voice reads "ninety-seven USDC and ninety-nine cents" instead
 *    of spelling a 24-character number.
 *
 * Only the agent-facing payload changes. Every wallet provider keeps returning its
 * exact value; nothing here ever invents, scales, or truncates the underlying amount
 * beyond the documented two-decimal presentation.
 */
export type AgentBalancePresentation = {
  /** The amount with exactly two decimals, e.g. `"97.99"`. */
  balance: string;
  /** The same amount in words, e.g. `"ninety-seven USDC and ninety-nine cents"`. */
  balanceSpoken: string;
};

/**
 * A plain non-negative decimal. Scientific notation, signs, and thousands separators
 * are rejected rather than parsed: an unrecognized provider value is passed through
 * untouched instead of being coerced into a number we cannot vouch for.
 */
const PLAIN_DECIMAL = /^\d+(?:\.\d+)?$/u;

/** The widest integer we can spell out: four three-digit scale groups. */
const MAX_SPELLABLE_DIGITS = 12;

const DIGITS = '0123456789';

function digitAt(digits: string, index: number): number {
  return DIGITS.indexOf(digits[index] ?? '');
}

function nextDigit(character: string): string | undefined {
  const index = DIGITS.indexOf(character);
  return index === -1 || index === DIGITS.length - 1 ? undefined : DIGITS[index + 1];
}

/** Increment a digit string by one, carrying across nines (`"099"` -> `"100"`). */
function incrementDigits(digits: string): string {
  const characters = [...digits];
  for (let index = characters.length - 1; index >= 0; index -= 1) {
    const next = nextDigit(characters[index] ?? '');
    if (next !== undefined) {
      characters[index] = next;
      return characters.join('');
    }
    characters[index] = '0';
  }
  return `1${characters.join('')}`;
}

/**
 * Rounds a validated plain decimal to two decimals using STRING arithmetic only —
 * no money value ever passes through a floating-point number.
 *
 * Rounding mode: half-up on the third decimal digit, e.g. `0.005` -> `"0.01"`,
 * `0.004` -> `"0.00"`, `99.999` -> `"100.00"`. Rounding (rather than truncation) is
 * the convention the statement-style amount the user reads should follow.
 */
function roundToTwoDecimals(value: string): { integer: string; fraction: string } {
  const [rawInteger = '', rawFraction = ''] = value.split('.');
  const integer = rawInteger.replace(/^0+(?=\d)/u, '');
  const fraction = rawFraction.padEnd(3, '0');
  const kept = fraction.slice(0, 2);
  const scaled = digitAt(fraction, 2) >= 5
    ? incrementDigits(`${integer}${kept}`)
    : `${integer}${kept}`;
  return {
    integer: scaled.slice(0, -2).replace(/^0+(?=\d)/u, '') || '0',
    fraction: scaled.slice(-2),
  };
}

const ENGLISH_UNITS = [
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
  'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen',
  'seventeen', 'eighteen', 'nineteen',
];
const ENGLISH_TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
const ENGLISH_SCALES = ['', 'thousand', 'million', 'billion'];

const SPANISH_UNITS = [
  'cero', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve',
  'diez', 'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete',
  'dieciocho', 'diecinueve', 'veinte', 'veintiuno', 'veintidós', 'veintitrés',
  'veinticuatro', 'veinticinco', 'veintiséis', 'veintisiete', 'veintiocho', 'veintinueve',
];
const SPANISH_TENS = ['', '', 'veinte', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa'];
const SPANISH_HUNDREDS = ['', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos', 'seiscientos', 'setecientos', 'ochocientos', 'novecientos'];
const SPANISH_SCALES = ['', 'mil', 'millones', 'mil millones'];

/** Split a digit string into three-digit groups, most significant first. */
function digitGroups(digits: string): string[] {
  const groups: string[] = [];
  for (let end = digits.length; end > 0; end -= 3) {
    groups.unshift(digits.slice(Math.max(0, end - 3), end));
  }
  return groups;
}

/** 1..99 as a 1- or 2-digit string; a zero group yields an empty string. */
function englishUnderHundred(digits: string): string {
  const value = digits.replace(/^0+/u, '');
  if (!value) return '';
  const tens = digitAt(value, 0);
  if (value.length === 1) return ENGLISH_UNITS[tens] ?? '';
  const units = digitAt(value, 1);
  if (tens === 0) return ENGLISH_UNITS[units] ?? '';
  if (tens === 1) return ENGLISH_UNITS[10 + units] ?? '';
  const tensWord = ENGLISH_TENS[tens] ?? '';
  return units === 0 ? tensWord : `${tensWord}-${ENGLISH_UNITS[units] ?? ''}`;
}

function englishUnderThousand(digits: string): string {
  const value = digits.replace(/^0+/u, '');
  if (!value) return '';
  if (value.length <= 2) return englishUnderHundred(value);
  const hundreds = `${ENGLISH_UNITS[digitAt(value, 0)] ?? ''} hundred`;
  const rest = englishUnderHundred(value.slice(1));
  return rest ? `${hundreds} ${rest}` : hundreds;
}

/** The whole part in English words, or `null` when it is too large to spell. */
function englishInteger(digits: string): string | null {
  const value = digits.replace(/^0+/u, '');
  if (!value || value === '0') return 'zero';
  if (value.length > MAX_SPELLABLE_DIGITS) return null;
  const groups = digitGroups(value);
  return groups
    .map((group, index) => {
      const scale = ENGLISH_SCALES[groups.length - 1 - index] ?? '';
      const words = englishUnderThousand(group);
      if (!words) return '';
      return scale ? `${words} ${scale}` : words;
    })
    .filter(Boolean)
    .join(' ');
}

/** 1..99 as a 1- or 2-digit string; a zero group yields an empty string. */
function spanishUnderHundred(digits: string): string {
  const value = digits.replace(/^0+/u, '');
  if (!value) return '';
  const tens = digitAt(value, 0);
  if (value.length === 1) return SPANISH_UNITS[tens] ?? '';
  const units = digitAt(value, 1);
  if (tens === 0) return SPANISH_UNITS[units] ?? '';
  // Spanish fuses 20..29 into a single word: veintiuno, veintidós, veintinueve.
  if (tens === 1 || tens === 2) return SPANISH_UNITS[tens * 10 + units] ?? '';
  const tensWord = SPANISH_TENS[tens] ?? '';
  return units === 0 ? tensWord : `${tensWord} y ${SPANISH_UNITS[units] ?? ''}`;
}

function spanishUnderThousand(digits: string): string {
  const value = digits.replace(/^0+/u, '');
  if (!value) return '';
  if (value.length <= 2) return spanishUnderHundred(value);
  const hundredsDigit = digitAt(value, 0);
  const rest = spanishUnderHundred(value.slice(1));
  if (hundredsDigit === 1) return rest ? `ciento ${rest}` : 'cien';
  const hundreds = SPANISH_HUNDREDS[hundredsDigit] ?? '';
  return rest ? `${hundreds} ${rest}` : hundreds;
}

/** `veintiuno` -> `veintiún`, `treinta y uno` -> `treinta y un` before a scale word. */
function spanishApocope(words: string): string {
  if (words.endsWith('veintiuno')) return `${words.slice(0, -'veintiuno'.length)}veintiún`;
  if (words.endsWith('uno')) return `${words.slice(0, -'uno'.length)}un`;
  return words;
}

/** The whole part in Spanish words, or `null` when it is too large to spell. */
function spanishInteger(digits: string): string | null {
  const value = digits.replace(/^0+/u, '');
  if (!value || value === '0') return 'cero';
  if (value.length > MAX_SPELLABLE_DIGITS) return null;
  const groups = digitGroups(value);
  return groups
    .map((group, index) => {
      const scaleIndex = groups.length - 1 - index;
      const scale = SPANISH_SCALES[scaleIndex] ?? '';
      const isSingleUnit = group.replace(/^0+/u, '') === '1';
      if (scaleIndex === 0) return spanishUnderThousand(group);
      // `mil` and `un millón` drop the counting word; every other group keeps it.
      if (isSingleUnit) return scaleIndex === 2 ? 'un millón' : scale;
      const words = spanishUnderThousand(group);
      return words ? `${spanishApocope(words)} ${scale}` : '';
    })
    .filter(Boolean)
    .join(' ');
}

function integerToWords(integer: string, language: ConversationLanguage): string | null {
  if (language === 'es') {
    // The whole part precedes the token noun, so a trailing `uno` apocopates:
    // "un USDC", "veintiún USDC".
    const words = spanishInteger(integer);
    return words === null ? null : spanishApocope(words);
  }
  return englishInteger(integer);
}

/**
 * The cents clause, or `null` when there is nothing to say. Whole amounts drop the
 * cents entirely because "forty-two USDC and zero cents" is noise for a listener;
 * the two-decimal `balance` field always keeps the full precision.
 */
function centsToWords(twoDecimals: string, language: ConversationLanguage): string | null {
  if (twoDecimals === '00') return null;
  if (language === 'es') {
    // Exactly one cent is singular and apocopated: "un centavo", "veintiún centavos".
    return twoDecimals === '01'
      ? 'un centavo'
      : `${spanishApocope(spanishUnderHundred(twoDecimals))} centavos`;
  }
  const words = englishUnderHundred(twoDecimals);
  return twoDecimals === '01' ? `${words} cent` : `${words} cents`;
}

/**
 * Build the spoken sentence. The token symbol is kept exactly as configured — it is a
 * proper noun to the user, not a word to translate, and never a spelled-out amount.
 */
function spokenAmount(
  integerWords: string,
  centsWords: string | null,
  token: string,
  language: ConversationLanguage,
): string {
  const amount = `${integerWords} ${token}`;
  if (!centsWords) return amount;
  return language === 'es' ? `${amount} con ${centsWords}` : `${amount} and ${centsWords}`;
}

/**
 * Present a provider balance to the agent in the shape it can read aloud.
 *
 * The provider value is only ever re-presented here; it is never re-derived. A value
 * that is not a plain decimal, or one whose whole part is too large to spell, is
 * returned verbatim in both fields — the model falls back to today's behaviour rather
 * than being handed a number nobody can vouch for.
 */
export function formatBalanceForAgent(input: {
  balance: string;
  token: string;
  language: ConversationLanguage;
}): AgentBalancePresentation {
  const candidate = input.balance.trim();
  const passthrough: AgentBalancePresentation = {
    balance: input.balance,
    balanceSpoken: input.balance,
  };
  if (!PLAIN_DECIMAL.test(candidate)) return passthrough;

  const rounded = roundToTwoDecimals(candidate);
  const integerWords = integerToWords(rounded.integer, input.language);
  if (integerWords === null) return passthrough;

  const centsWords = centsToWords(rounded.fraction, input.language);
  return {
    balance: `${rounded.integer}.${rounded.fraction}`,
    balanceSpoken: spokenAmount(integerWords, centsWords, input.token, input.language),
  };
}
