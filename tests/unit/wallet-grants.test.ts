import { describe, expect, it } from "vitest";
import {
  GrantValidationError,
  atomic6ToUsdc,
  defaultGrantInput,
  validateGrantInput,
  usdcToAtomic6,
} from "../../src/wallet/embedded.js";

const RECIPIENT = "0x9999999999999999999999999999999999999999";

describe("grant validation and atomic6 conversions (PEW-007)", () => {
  it("converts whole USDC to atomic6 (10 USDC -> 10000000, 50 -> 50000000)", () => {
    expect(usdcToAtomic6("10")).toBe("10000000");
    expect(usdcToAtomic6("50")).toBe("50000000");
    expect(atomic6ToUsdc("10000000")).toBe("10");
    expect(atomic6ToUsdc("50000000")).toBe("50");
  });

  it("accepts the pinned default grant input (10 USDC/transfer, 50 USDC/rolling hour, 3600s)", () => {
    const input = defaultGrantInput([RECIPIENT]);
    expect(() => validateGrantInput(input)).not.toThrow();
    expect(input.perTransferAtomic6).toBe("10000000");
    expect(input.rollingTotalAtomic6).toBe("50000000");
    expect(input.rollingWindowSeconds).toBe(3600);
  });

  it("rejects a zero per-transfer limit", () => {
    const input = defaultGrantInput([RECIPIENT]);
    expect(() =>
      validateGrantInput({ ...input, perTransferAtomic6: "0" }),
    ).toThrow(GrantValidationError);
  });

  it("rejects a negative or non-integer per-transfer limit", () => {
    const input = defaultGrantInput([RECIPIENT]);
    expect(() =>
      validateGrantInput({ ...input, perTransferAtomic6: "-1" }),
    ).toThrow(GrantValidationError);
    expect(() =>
      validateGrantInput({ ...input, perTransferAtomic6: "1.5" }),
    ).toThrow(GrantValidationError);
  });

  it("rejects a zero rolling total limit", () => {
    const input = defaultGrantInput([RECIPIENT]);
    expect(() =>
      validateGrantInput({ ...input, rollingTotalAtomic6: "0" }),
    ).toThrow(GrantValidationError);
  });

  it("rejects an empty recipient list", () => {
    const input = defaultGrantInput([RECIPIENT]);
    expect(() => validateGrantInput({ ...input, recipients: [] })).toThrow(
      /recipient/i,
    );
  });

  it("rejects an invalid recipient address", () => {
    const input = defaultGrantInput([RECIPIENT]);
    expect(() =>
      validateGrantInput({ ...input, recipients: ["not-an-address"] }),
    ).toThrow(/recipient/i);
  });

  it("rejects a wrong rolling window (Privy only supports 3600s)", () => {
    const input = defaultGrantInput([RECIPIENT]);
    expect(() =>
      validateGrantInput({ ...input, rollingWindowSeconds: 60 }),
    ).toThrow(/3600/i);
    expect(() =>
      validateGrantInput({ ...input, rollingWindowSeconds: 7200 }),
    ).toThrow(/3600/i);
  });

  it("rejects a missing gas ceiling", () => {
    const input = defaultGrantInput([RECIPIENT]);
    expect(() => validateGrantInput({ ...input, gasCeiling: "" })).toThrow(
      /gas/i,
    );
  });

  it("refuses a non-integer USDC amount in the atomic6 conversion", () => {
    expect(() => usdcToAtomic6("10.5")).toThrow(GrantValidationError);
    expect(() => atomic6ToUsdc("-5")).toThrow(GrantValidationError);
  });
});
