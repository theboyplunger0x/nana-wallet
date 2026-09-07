export type LiveKitPrivacyConfig = {
  recordingEnabled: false;
  observabilityRecording: false;
  deepgramMipOptOut: true;
};

export type LiveKitTokenIssuerConfig = {
  url: string; // LIVEKIT_URL, non-empty (server-side: ws://livekit:7880 in compose)
  browserUrl: string; // LIVEKIT_BROWSER_URL ?? url — browser-facing URL returned in the token response
  apiKey: string; // LIVEKIT_API_KEY
  apiSecret: string; // LIVEKIT_API_SECRET
  defaultAgentName: string; // LIVEKIT_AGENT_NAME ?? 'nani-agent'
  roomTokenTtlSeconds: number; // LIVEKIT_ROOM_TOKEN_TTL, default 600, minimum 60 (REJECT below)
};

const ROOM_TOKEN_TTL_MINIMUM_SECONDS = 60;

export function readLiveKitTokenIssuerConfig(
  environment: NodeJS.ProcessEnv = process.env,
): LiveKitTokenIssuerConfig {
  const missing: string[] = [];
  for (const name of ['LIVEKIT_URL', 'LIVEKIT_API_KEY', 'LIVEKIT_API_SECRET']) {
    if (!environment[name]?.trim()) missing.push(name);
  }
  if (missing.length > 0) {
    const list =
      missing.length === 1
        ? missing[0]
        : `${missing.slice(0, -1).join(', ')}, and ${missing[missing.length - 1]}`;
    const verb = missing.length === 1 ? 'is' : 'are';
    throw new Error(`${list} ${verb} required to issue LiveKit room tokens.`);
  }

  let roomTokenTtlSeconds = 600;
  const rawTtl = environment.LIVEKIT_ROOM_TOKEN_TTL;
  if (rawTtl !== undefined && rawTtl !== '') {
    const parsed = Number(rawTtl);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      throw new Error('LIVEKIT_ROOM_TOKEN_TTL must be a positive integer.');
    }
    if (parsed < ROOM_TOKEN_TTL_MINIMUM_SECONDS) {
      throw new Error('LIVEKIT_ROOM_TOKEN_TTL must be at least 60 seconds.');
    }
    roomTokenTtlSeconds = parsed;
  }

  return {
    url: environment.LIVEKIT_URL!.trim(),
    // Browser-facing URL: the API/worker may register over the compose
    // network (ws://livekit:7880) while the browser must reach the server
    // through the loopback-published port (ws://localhost:7880).
    browserUrl: environment.LIVEKIT_BROWSER_URL?.trim() || environment.LIVEKIT_URL!.trim(),
    apiKey: environment.LIVEKIT_API_KEY!.trim(),
    apiSecret: environment.LIVEKIT_API_SECRET!.trim(),
    defaultAgentName: environment.LIVEKIT_AGENT_NAME?.trim() || 'nani-agent',
    roomTokenTtlSeconds,
  };
}

export function readLiveKitPrivacyConfig(environment: NodeJS.ProcessEnv = process.env): LiveKitPrivacyConfig {
  for (const name of ['LIVEKIT_RECORDING_ENABLED', 'AGENT_OBSERVABILITY_RECORDING']) {
    const value = environment[name];
    if (value !== undefined && value !== '' && !['0', '1', 'false', 'true'].includes(value)) {
      throw new Error(`${name} must be explicitly true or false.`);
    }
  }
  if (environment.LIVEKIT_RECORDING_ENABLED === '1' || environment.LIVEKIT_RECORDING_ENABLED === 'true') {
    throw new Error('LiveKit recording must remain disabled.');
  }
  if (environment.AGENT_OBSERVABILITY_RECORDING === '1' || environment.AGENT_OBSERVABILITY_RECORDING === 'true') {
    throw new Error('Agent observability recording must remain disabled.');
  }
  return { recordingEnabled: false, observabilityRecording: false, deepgramMipOptOut: true };
}
