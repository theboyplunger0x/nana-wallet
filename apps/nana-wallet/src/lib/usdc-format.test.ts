import { describe, expect, it } from "vitest";

import { MIN_DISPLAY, formatUsdcBalance } from "./usdc-format";

/** WP-010: exact string/BigInt formatting, no Number precision loss. */
describe("formatUsdcBalance", () => {
  it("keeps the minimum atomic amount visible", () => {
    expect(formatUsdcBalance("1")).toBe(MIN_DISPLAY);
  });

  it("formats the documented large uint256 exactly", () => {
    expect(formatUsdcBalance("9007199254740993")).toBe("9.007.199.254,740993");
  });

  it("formats zero as an exact cero", () => {
    expect(formatUsdcBalance("0")).toBe("0");
  });

  it("groups thousands and trims trailing fraction zeros", () => {
    expect(formatUsdcBalance("1250000")).toBe("1,25");
    expect(formatUsdcBalance("42000000")).toBe("42");
    expect(formatUsdcBalance("1000000")).toBe("1");
    expect(formatUsdcBalance("12345678901")).toBe("12.345,678901");
  });

  it("rejects non-canonical atomic strings", () => {
    expect(() => formatUsdcBalance("-1")).toThrow();
    expect(() => formatUsdcBalance("01")).toThrow();
    expect(() => formatUsdcBalance("1.5")).toThrow();
    expect(() => formatUsdcBalance("")).toThrow();
  });
});
