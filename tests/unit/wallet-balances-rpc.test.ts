import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { RpcBalanceReader } from "../../src/wallet/balances.js";

/**
 * WP-006/WP-007: the RPC adapter is exercised against a controlled local
 * JSON-RPC server. It must only observe eth_chainId and eth_call to the fixed
 * USDC contract, validate ABI shapes and fail closed on every malformed
 * response — including a full 8s-deadline timeout, tested with a tiny
 * deadline override instead of really waiting.
 */

const USDC = "0x3600000000000000000000000000000000000000";
const ADDRESS = "0x1111111111111111111111111111111111111111";

type RpcHandler = (
  method: string,
  params: unknown[],
) =>
  | { result?: unknown; error?: { code: number; message: string } }
  | undefined;

async function startRpc(
  handler: RpcHandler,
): Promise<{
  server: Server;
  url: string;
  calls: Array<{ method: string; params: unknown[] }>;
}> {
  const calls: Array<{ method: string; params: unknown[] }> = [];
  const server = createServer((request, response) => {
    let body = "";
    request.on("data", (chunk) => (body += chunk));
    request.on("end", () => {
      const parsed = JSON.parse(body) as {
        id: number;
        method: string;
        params: unknown[];
      };
      calls.push({ method: parsed.method, params: parsed.params });
      const outcome = handler(parsed.method, parsed.params);
      response.setHeader("content-type", "application/json");
      if (!outcome) {
        response.end(JSON.stringify({ jsonrpc: "2.0", id: parsed.id }));
        return;
      }
      response.end(
        JSON.stringify({
          jsonrpc: "2.0",
          id: parsed.id,
          ...(outcome.error
            ? { error: outcome.error }
            : { result: outcome.result }),
        }),
      );
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string")
    throw new Error("no port");
  return { server, url: `http://127.0.0.1:${address.port}`, calls };
}

function readyHandler(balanceAtomic: bigint): RpcHandler {
  return (method, params) => {
    if (method === "eth_chainId")
      return { result: "0x" + (5042002).toString(16) };
    if (method === "eth_call") {
      const call = params[0] as { to: string; data: string };
      if (call.to.toLowerCase() !== USDC) {
        return { error: { code: -32602, message: "unexpected contract" } };
      }
      if (call.data.startsWith("0x313ce567"))
        return { result: "0x" + 6n.toString(16).padStart(64, "0") };
      if (call.data.startsWith("0x70a08231")) {
        const arg = call.data.slice(10);
        expect(arg).toBe(ADDRESS.slice(2).toLowerCase().padStart(64, "0"));
        return { result: "0x" + balanceAtomic.toString(16).padStart(64, "0") };
      }
      return { error: { code: -32602, message: "unexpected selector" } };
    }
    return undefined;
  };
}

describe("RpcBalanceReader (WP-006/WP-007)", () => {
  const servers: Server[] = [];
  afterAll(() => {
    for (const server of servers) server.close();
  });

  it("reads one USDC from six-decimal balanceOf and only calls eth_chainId/eth_call", async () => {
    const { server, url, calls } = await startRpc(readyHandler(1_000_000n));
    servers.push(server);
    const reader = new RpcBalanceReader(url);
    await expect(
      reader.readUsdcAtomic(ADDRESS, new AbortController().signal),
    ).resolves.toBe("1000000");
    expect(calls.map((call) => call.method)).toEqual([
      "eth_chainId",
      "eth_call",
      "eth_call",
    ]);
  });

  it("serializes uint256 max and zero without Number precision loss", async () => {
    const max = (1n << 256n) - 1n;
    const { server, url } = await startRpc(readyHandler(max));
    servers.push(server);
    const reader = new RpcBalanceReader(url);
    await expect(
      reader.readUsdcAtomic(ADDRESS, new AbortController().signal),
    ).resolves.toBe(
      "115792089237316195423570985008687907853269984665640564039457584007913129639935",
    );

    const zero = await startRpc(readyHandler(0n));
    servers.push(zero.server);
    const zeroReader = new RpcBalanceReader(zero.url);
    await expect(
      zeroReader.readUsdcAtomic(ADDRESS, new AbortController().signal),
    ).resolves.toBe("0");
  });

  it("rejects a wrong chain", async () => {
    const { server, url } = await startRpc((_method) => ({ result: "0x1" }));
    servers.push(server);
    const reader = new RpcBalanceReader(url);
    await expect(
      reader.readUsdcAtomic(ADDRESS, new AbortController().signal),
    ).rejects.toThrow(/Arc testnet/);
  });

  it("rejects decimals other than six", async () => {
    const { server, url } = await startRpc((method) => {
      if (method === "eth_chainId")
        return { result: "0x" + (5042002).toString(16) };
      return { result: "0x" + 18n.toString(16).padStart(64, "0") };
    });
    servers.push(server);
    const reader = new RpcBalanceReader(url);
    await expect(
      reader.readUsdcAtomic(ADDRESS, new AbortController().signal),
    ).rejects.toThrow(/unidades/);
  });

  it("rejects a JSON-RPC error response", async () => {
    const { server, url } = await startRpc(() => ({
      error: { code: -32000, message: "boom" },
    }));
    servers.push(server);
    const reader = new RpcBalanceReader(url);
    await expect(
      reader.readUsdcAtomic(ADDRESS, new AbortController().signal),
    ).rejects.toThrow(/rechazó/);
  });

  it("rejects a mismatched correlation id", async () => {
    const server = createServer((_request, response) => {
      response.setHeader("content-type", "application/json");
      response.end(
        JSON.stringify({
          jsonrpc: "2.0",
          id: 999,
          result: "0x" + (5042002).toString(16),
        }),
      );
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    servers.push(server);
    const address = server.address();
    const url = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
    const reader = new RpcBalanceReader(url);
    await expect(
      reader.readUsdcAtomic(ADDRESS, new AbortController().signal),
    ).rejects.toThrow(/no es válida/);
  });

  it("rejects a malformed ABI word", async () => {
    const { server, url } = await startRpc((method) =>
      method === "eth_chainId"
        ? { result: "0x" + (5042002).toString(16) }
        : { result: "0xzz" },
    );
    servers.push(server);
    const reader = new RpcBalanceReader(url);
    await expect(
      reader.readUsdcAtomic(ADDRESS, new AbortController().signal),
    ).rejects.toThrow(/formato/);
  });

  it("fails on an unreachable node", async () => {
    const reader = new RpcBalanceReader("http://127.0.0.1:1", fetch, 500);
    await expect(
      reader.readUsdcAtomic(ADDRESS, new AbortController().signal),
    ).rejects.toThrow(/No pudimos consultar el saldo/);
  });

  it("aborts the whole operation when the shared deadline expires", async () => {
    const server = createServer((_request, response) => {
      // Never respond; force the deadline to fire.
      const timer = setTimeout(() => response.end("late"), 2_000);
      timer.unref();
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    servers.push(server);
    const address = server.address();
    const url = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
    const reader = new RpcBalanceReader(url, fetch, 50);
    await expect(
      reader.readUsdcAtomic(ADDRESS, new AbortController().signal),
    ).rejects.toThrow(/tardó demasiado/);
  });

  it("honors an externally aborted signal", async () => {
    const server = createServer(() => {
      /* never respond */
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    servers.push(server);
    const address = server.address();
    const url = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
    const reader = new RpcBalanceReader(url, fetch, 10_000);
    const controller = new AbortController();
    const pending = reader.readUsdcAtomic(ADDRESS, controller.signal);
    controller.abort();
    await expect(pending).rejects.toThrow(/tardó demasiado/);
  });
});
