import {
  ARC_TESTNET_CHAIN_ID,
  ARC_USDC_ERC20,
  DEFAULT_GAS_CEILING,
  PER_TRANSFER_USDC,
  ROLLING_TOTAL_USDC,
} from "./privy-client.js";

/**
 * PEW-014: signer-enrollment policy construction for the Privy server API.
 *
 * The provider policy engine reads a flat list of ALLOW rules (one policy holds
 * every rule). When a policy is attached to a signer, unlisted RPC methods are
 * DENY by default, so this single policy both allows exactly eth_signTransaction
 * within the pinned envelope and rejects everything else.
 *
 * Rule shape (documented): { field_source, field, operator, value, abi? }.
 * Transaction-level fields use field_source "ethereum_transaction"; calldata
 * decoding uses field_source "ethereum_calldata" plus a function ABI block.
 *
 * ⚠️ LIVE-CONFIRMATION CAVEAT: the exact ABI field names (`transfer._to` /
 * `transfer._amount`) and the gas/value fields below are pinned from official
 * documentation, but the capability probe MUST verify the provider accepted the
 * rule by reading the policy back (complete-readback), never by assuming the
 * JSON was stored verbatim. Do not ship live signing on trust of this shape.
 *
 * READINESS GATE (parent-controlled): rolling-window 50 USDC/3600s aggregation
 * stays BLOCKED until wallet-identity group_by is proven. No aggregation resource
 * or aggregation condition is created here — only per-transfer cap and allowlist.
 */

export const ENROLLMENT_PER_TRANSFER_USDC = PER_TRANSFER_USDC; // "10"
export const ENROLLMENT_ROLLING_TOTAL_USDC = ROLLING_TOTAL_USDC; // "50"
export const ENROLLMENT_WINDOW_SECONDS = 3600;
export const ENROLLMENT_GAS_CEILING = DEFAULT_GAS_CEILING; // "0.001"
export const ENROLLMENT_USDC_CONTRACT = ARC_USDC_ERC20;
export const ENROLLMENT_CHAIN_ID = ARC_TESTNET_CHAIN_ID;

/** Parent-gate block reason for the rolling aggregation (NOT implemented yet). */
export const AGGREGATION_BLOCK_REASON =
  "provider per-wallet aggregation scope unproven (group_by only supports request fields; wallet identity not documented)";

export type EnrollmentPolicyRule = {
  field_source: "ethereum_transaction" | "ethereum_calldata";
  field: string;
  operator: string;
  value: string | number | string[];
  abi?: Array<{
    type: "function";
    name: string;
    stateMutability?: string;
    inputs?: Array<{ name: string; type: string }>;
  }>;
};

/**
 * Builds the single ALLOW rule set for a signer enrollment.
 *
 * `recipients` is the explicit allowlist; every other field is pinned to the
 * Arc Testnet USDC envelope (chain 5042002, USDC ERC-20, zero native value,
 * transfer(recipient, amount) calldata, amount <= 10 USDC atomic6, gas ceiling).
 */
export function buildEnrollmentPolicyRules(input: {
  recipients: string[];
}): EnrollmentPolicyRule[] {
  if (!Array.isArray(input.recipients) || input.recipients.length === 0) {
    throw new Error(
      "buildEnrollmentPolicyRules: at least one recipient is required.",
    );
  }
  const transferAbi: NonNullable<EnrollmentPolicyRule["abi"]> = [
    {
      type: "function",
      name: "transfer",
      stateMutability: "nonpayable",
      inputs: [
        { name: "_to", type: "address" },
        { name: "_amount", type: "uint256" },
      ],
    },
  ];
  return [
    {
      field_source: "ethereum_transaction",
      field: "chain_id",
      operator: "eq",
      value: ENROLLMENT_CHAIN_ID,
    },
    {
      field_source: "ethereum_transaction",
      field: "to",
      operator: "eq",
      value: ENROLLMENT_USDC_CONTRACT,
    },
    {
      field_source: "ethereum_transaction",
      field: "value",
      operator: "eq",
      value: "0",
    },
    {
      field_source: "ethereum_calldata",
      field: "transfer._amount",
      operator: "lte",
      value: "10000000", // 10 USDC at 6 decimals, atomic units
      abi: transferAbi,
    },
    {
      field_source: "ethereum_calldata",
      field: "transfer._to",
      operator: "in_condition_set",
      value: input.recipients,
      abi: transferAbi,
    },
    {
      field_source: "ethereum_transaction",
      field: "gas",
      operator: "lte",
      value: ENROLLMENT_GAS_CEILING,
    },
  ];
}
