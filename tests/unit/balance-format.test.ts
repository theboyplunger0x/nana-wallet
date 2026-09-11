import { describe, expect, it } from 'vitest';
import { formatBalanceForAgent } from '../../src/agent/balance-format.js';

/**
 * The agent-facing balance presentation.
 *
 * Two properties matter and are asserted independently:
 *  1. `balance` carries EXACTLY two decimals, computed with string arithmetic so no
 *     floating-point representation ever touches a money value.
 *  2. `balanceSpoken` is the same amount written out in words, so a TTS voice does not
 *     read "97.989332609300122852" digit by digit.
 */
describe('formatBalanceForAgent — two decimals', () => {
  it('rounds the provider precision down to two decimals', () => {
    const result = formatBalanceForAgent({
      balance: '97.989332609300122852',
      token: 'USDC',
      language: 'en',
    });

    expect(result.balance).toBe('97.99');
  });

  it('pads values with fewer than two decimals', () => {
    expect(formatBalanceForAgent({ balance: '42.5', token: 'USDC', language: 'en' }).balance).toBe('42.50');
    expect(formatBalanceForAgent({ balance: '42', token: 'USDC', language: 'en' }).balance).toBe('42.00');
    expect(formatBalanceForAgent({ balance: '0', token: 'USDC', language: 'en' }).balance).toBe('0.00');
  });

  it('keeps values that already have exactly two decimals', () => {
    expect(formatBalanceForAgent({ balance: '42.52', token: 'USDC', language: 'en' }).balance).toBe('42.52');
  });

  it('rounds half up on the third decimal digit', () => {
    expect(formatBalanceForAgent({ balance: '0.005', token: 'USDC', language: 'en' }).balance).toBe('0.01');
    expect(formatBalanceForAgent({ balance: '0.004', token: 'USDC', language: 'en' }).balance).toBe('0.00');
    expect(formatBalanceForAgent({ balance: '0.0449999', token: 'USDC', language: 'en' }).balance).toBe('0.04');
  });

  it('carries the rounding into the integer part', () => {
    expect(formatBalanceForAgent({ balance: '9.999', token: 'USDC', language: 'en' }).balance).toBe('10.00');
    expect(formatBalanceForAgent({ balance: '0.999', token: 'USDC', language: 'en' }).balance).toBe('1.00');
    expect(formatBalanceForAgent({ balance: '99.999', token: 'USDC', language: 'en' }).balance).toBe('100.00');
    expect(formatBalanceForAgent({ balance: '999.995', token: 'USDC', language: 'en' }).balance).toBe('1000.00');
  });

  it('normalizes redundant leading zeros without changing the amount', () => {
    expect(formatBalanceForAgent({ balance: '007.5000', token: 'USDC', language: 'en' }).balance).toBe('7.50');
    expect(formatBalanceForAgent({ balance: '0.0', token: 'USDC', language: 'en' }).balance).toBe('0.00');
  });
});

describe('formatBalanceForAgent — spoken form in English', () => {
  it('writes the amount, the token symbol, and the cents out in words', () => {
    const result = formatBalanceForAgent({ balance: '96.99', token: 'USDC', language: 'en' });

    expect(result.balanceSpoken).toBe('ninety-six USDC and ninety-nine cents');
  });

  it('spells the rounded value, never the raw provider decimal', () => {
    const result = formatBalanceForAgent({
      balance: '97.989332609300122852',
      token: 'USDC',
      language: 'en',
    });

    expect(result.balanceSpoken).toBe('ninety-seven USDC and ninety-nine cents');
  });

  it('omits the cents clause when the amount is whole', () => {
    expect(formatBalanceForAgent({ balance: '42.00', token: 'USDC', language: 'en' }).balanceSpoken)
      .toBe('forty-two USDC');
    expect(formatBalanceForAgent({ balance: '42', token: 'USDC', language: 'en' }).balanceSpoken)
      .toBe('forty-two USDC');
  });

  it('keeps a leading zero on the cents below ten', () => {
    expect(formatBalanceForAgent({ balance: '0.05', token: 'USDC', language: 'en' }).balanceSpoken)
      .toBe('zero USDC and five cents');
  });

  it('uses the singular cent when the amount ends in exactly one cent', () => {
    expect(formatBalanceForAgent({ balance: '42.01', token: 'USDC', language: 'en' }).balanceSpoken)
      .toBe('forty-two USDC and one cent');
    expect(formatBalanceForAgent({ balance: '0.01', token: 'USDC', language: 'en' }).balanceSpoken)
      .toBe('zero USDC and one cent');
  });

  it('handles teens, tens, and hyphenated compounds', () => {
    expect(formatBalanceForAgent({ balance: '13.19', token: 'USDC', language: 'en' }).balanceSpoken)
      .toBe('thirteen USDC and nineteen cents');
    expect(formatBalanceForAgent({ balance: '20.30', token: 'USDC', language: 'en' }).balanceSpoken)
      .toBe('twenty USDC and thirty cents');
  });

  it('handles hundreds and thousands', () => {
    expect(formatBalanceForAgent({ balance: '100.00', token: 'USDC', language: 'en' }).balanceSpoken)
      .toBe('one hundred USDC');
    expect(formatBalanceForAgent({ balance: '1234.56', token: 'USDC', language: 'en' }).balanceSpoken)
      .toBe('one thousand two hundred thirty-four USDC and fifty-six cents');
    expect(formatBalanceForAgent({ balance: '1000000.00', token: 'USDC', language: 'en' }).balanceSpoken)
      .toBe('one million USDC');
  });
});

describe('formatBalanceForAgent — spoken form in Spanish', () => {
  it('writes the amount, the token symbol, and the cents out in words', () => {
    const result = formatBalanceForAgent({ balance: '96.99', token: 'USDC', language: 'es' });

    expect(result.balanceSpoken).toBe('noventa y seis USDC con noventa y nueve centavos');
  });

  it('spells the rounded value, never the raw provider decimal', () => {
    const result = formatBalanceForAgent({
      balance: '97.989332609300122852',
      token: 'USDC',
      language: 'es',
    });

    expect(result.balanceSpoken).toBe('noventa y siete USDC con noventa y nueve centavos');
  });

  it('omits the cents clause when the amount is whole', () => {
    expect(formatBalanceForAgent({ balance: '42.00', token: 'USDC', language: 'es' }).balanceSpoken)
      .toBe('cuarenta y dos USDC');
  });

  it('keeps a leading zero on the cents below ten', () => {
    expect(formatBalanceForAgent({ balance: '0.05', token: 'USDC', language: 'es' }).balanceSpoken)
      .toBe('cero USDC con cinco centavos');
  });

  it('uses the singular centavo for exactly one cent', () => {
    expect(formatBalanceForAgent({ balance: '96.01', token: 'USDC', language: 'es' }).balanceSpoken)
      .toBe('noventa y seis USDC con un centavo');
  });

  it('apocopates the numeral before the centavos noun', () => {
    expect(formatBalanceForAgent({ balance: '96.21', token: 'USDC', language: 'es' }).balanceSpoken)
      .toBe('noventa y seis USDC con veintiún centavos');
    expect(formatBalanceForAgent({ balance: '96.31', token: 'USDC', language: 'es' }).balanceSpoken)
      .toBe('noventa y seis USDC con treinta y un centavos');
    expect(formatBalanceForAgent({ balance: '96.41', token: 'USDC', language: 'es' }).balanceSpoken)
      .toBe('noventa y seis USDC con cuarenta y un centavos');
  });

  it('apocopates the whole amount when it directly precedes the token symbol', () => {
    expect(formatBalanceForAgent({ balance: '1.00', token: 'USDC', language: 'es' }).balanceSpoken)
      .toBe('un USDC');
    expect(formatBalanceForAgent({ balance: '21.00', token: 'USDC', language: 'es' }).balanceSpoken)
      .toBe('veintiún USDC');
    expect(formatBalanceForAgent({ balance: '21.50', token: 'USDC', language: 'es' }).balanceSpoken)
      .toBe('veintiún USDC con cincuenta centavos');
  });

  it('handles the twenties, the tens, and cien/ciento', () => {
    expect(formatBalanceForAgent({ balance: '21.22', token: 'USDC', language: 'es' }).balanceSpoken)
      .toBe('veintiún USDC con veintidós centavos');
    expect(formatBalanceForAgent({ balance: '33.90', token: 'USDC', language: 'es' }).balanceSpoken)
      .toBe('treinta y tres USDC con noventa centavos');
    expect(formatBalanceForAgent({ balance: '100.00', token: 'USDC', language: 'es' }).balanceSpoken)
      .toBe('cien USDC');
    expect(formatBalanceForAgent({ balance: '121.00', token: 'USDC', language: 'es' }).balanceSpoken)
      .toBe('ciento veintiún USDC');
    expect(formatBalanceForAgent({ balance: '500.00', token: 'USDC', language: 'es' }).balanceSpoken)
      .toBe('quinientos USDC');
  });

  it('handles mil, un millón, and the apocope before a scale word', () => {
    expect(formatBalanceForAgent({ balance: '1000.00', token: 'USDC', language: 'es' }).balanceSpoken)
      .toBe('mil USDC');
    expect(formatBalanceForAgent({ balance: '21000.00', token: 'USDC', language: 'es' }).balanceSpoken)
      .toBe('veintiún mil USDC');
    expect(formatBalanceForAgent({ balance: '1000000.00', token: 'USDC', language: 'es' }).balanceSpoken)
      .toBe('un millón USDC');
    expect(formatBalanceForAgent({ balance: '3000000.00', token: 'USDC', language: 'es' }).balanceSpoken)
      .toBe('tres millones USDC');
  });
});

describe('formatBalanceForAgent — never invents an amount', () => {
  it('never emits a digit in the spoken field for a spellable balance', () => {
    for (const balance of ['97.989332609300122852', '0.05', '1234.56', '1000000.00']) {
      const result = formatBalanceForAgent({ balance, token: 'USDC', language: 'es' });
      expect(result.balanceSpoken).not.toMatch(/\d/u);
    }
  });

  it('passes an unrepresentable provider value through unchanged', () => {
    for (const balance of ['unknown', '', '-1.5', '1e21', 'NaN', '  ']) {
      const result = formatBalanceForAgent({ balance, token: 'USDC', language: 'en' });
      expect(result.balance).toBe(balance);
      expect(result.balanceSpoken).toBe(balance);
    }
  });

  it('passes a balance too large to spell out through unchanged instead of inventing words', () => {
    const huge = '99999999999999999999999999.5';
    const result = formatBalanceForAgent({ balance: huge, token: 'USDC', language: 'en' });

    expect(result.balance).toBe(huge);
    expect(result.balanceSpoken).toBe(huge);
  });

  it('keeps the configured token symbol verbatim', () => {
    expect(formatBalanceForAgent({ balance: '1.00', token: 'USDT', language: 'en' }).balanceSpoken)
      .toBe('one USDT');
    expect(formatBalanceForAgent({ balance: '1.00', token: 'USDT', language: 'es' }).balanceSpoken)
      .toBe('un USDT');
  });
});
