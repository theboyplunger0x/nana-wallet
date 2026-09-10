import { describe, expect, it } from "vitest";
import { readLiveKitWorkerConfig } from "../../src/livekit/worker.js";
import {
  readLiveKitTokenIssuerConfig,
  resolveDefaultAgentName,
} from "../../src/config/livekit.js";

describe("LiveKit worker configuration", () => {
  it("rejects an incomplete credential set", () => {
    expect(() => readLiveKitWorkerConfig({})).toThrow(
      "LIVEKIT_URL, LIVEKIT_API_KEY, and LIVEKIT_API_SECRET",
    );
  });

  it("accepts complete development credentials", () => {
    expect(
      readLiveKitWorkerConfig({
        LIVEKIT_URL: "wss://example.livekit.cloud",
        LIVEKIT_API_KEY: "dev-key",
        LIVEKIT_API_SECRET: "dev-secret",
      }),
    ).toMatchObject({ url: "wss://example.livekit.cloud", apiKey: "dev-key" });
  });
});

describe("agent dispatch-name consistency (worker registration vs token issuer)", () => {
  it("registers the worker under the same name the issuer dispatches by (default)", () => {
    // Worker registration (ServerOptions.agentName) and token dispatch
    // (RoomConfiguration.agents) must derive from ONE source:
    // resolveDefaultAgentName. This test fails if either side stops using it.
    const env = {
      LIVEKIT_URL: "wss://example.livekit.cloud",
      LIVEKIT_API_KEY: "dev-key",
      LIVEKIT_API_SECRET: "dev-secret",
    };
    const worker = readLiveKitWorkerConfig(env);
    const issuer = readLiveKitTokenIssuerConfig(env);
    expect(resolveDefaultAgentName(env)).toBe("nani-agent");
    expect(issuer.defaultAgentName).toBe("nani-agent");
    expect(resolveDefaultAgentName(env)).toBe(issuer.defaultAgentName);
  });

  it("resolves LIVEKIT_AGENT_NAME consistently for worker and issuer", () => {
    const env = {
      LIVEKIT_URL: "wss://example.livekit.cloud",
      LIVEKIT_API_KEY: "dev-key",
      LIVEKIT_API_SECRET: "dev-secret",
      LIVEKIT_AGENT_NAME: "  custom-agent  ",
    };
    expect(resolveDefaultAgentName(env)).toBe("custom-agent");
    expect(readLiveKitTokenIssuerConfig(env).defaultAgentName).toBe(
      "custom-agent",
    );
  });
});
