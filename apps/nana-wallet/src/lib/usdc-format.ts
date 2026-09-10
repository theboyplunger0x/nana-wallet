/**
 * Exact string/BigInt USDC formatting (WP-010).
 *
 * The backend sends the canonical atomic uint256 decimal string. Formatting
 * MUST NOT go through Number: amounts like 9007199254740993 lose precision and
 * 1 atomic unit (0.000001 USDC) would round to zero. es-AR convention: "." for
 * the integer group and "," for the six-digit fraction; trailing fraction
 * zeros are trimmed without altering the value.
 */

export function formatUsdcBalance(balanceAtomic: string): string {
  if (!/^(0|[1-9][0-9]*)$/.test(balanceAtomic)) {
    throw new Error("Invalid atomic balance string.");
  }
  const value = BigInt(balanceAtomic);
  const whole = value / 1_000_000n;
  const fraction = (value % 1_000_000n).toString().padStart(6, "0").replace(/0+$/, "");
  const groupedWhole = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return fraction ? `${groupedWhole},${fraction}` : groupedWhole;
}

/** 1 atomic unit formats as the exact minimum, never a rounded zero. */
export const MIN_DISPLAY = "0,000001";
