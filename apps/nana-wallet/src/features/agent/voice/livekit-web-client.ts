import {
  MediaDeviceFailure,
  Room,
  RoomEvent,
  TokenSource,
  Track,
  type RemoteParticipant,
} from "livekit-client";

import { api } from "@/lib/api";

import type { VoiceClient } from "./voice-client";

export type LiveKitWebClientOptions = {
  getConversationId?: () => string | null;
  onConversationBound?: (conversationId: string) => void;
  onRevision?: (revision: number) => void;
  onAgentState?: (state: string) => void;
  onConnectionLost?: () => void;
  onReconnected?: () => void;
  room?: Room;
  tokenSource?: "local" | "cloud";
  tokenServerId?: string;
  agentName?: string;
  participantIdentity?: string;
};

type LiveKitClientConfig =
  | { tokenSource: "local"; participantIdentity: string }
  | {
      tokenSource: "cloud";
      tokenServerId: string;
      agentName: string;
      participantIdentity: string;
    };

function readConfig(options: LiveKitWebClientOptions): LiveKitClientConfig {
  const source = options.tokenSource ?? (import.meta.env["VITE_LIVEKIT_TOKEN_SOURCE"] || undefined);
  const participantIdentity =
    options.participantIdentity ?? import.meta.env["VITE_LIVEKIT_PARTICIPANT_IDENTITY"];
  if (source === "cloud") {
    const tokenServerId = options.tokenServerId ?? import.meta.env["VITE_LIVEKIT_TOKEN_SERVER_ID"];
    if (!tokenServerId || !participantIdentity)
      throw new Error("Live voice is not configured for this browser.");
    const agentName =
      options.agentName ?? import.meta.env["VITE_LIVEKIT_AGENT_NAME"] ?? "nani-agent";
    return { tokenSource: "cloud", tokenServerId, agentName, participantIdentity };
  }
  if (source === "local" || source === undefined) {
    if (!participantIdentity) throw new Error("Live voice is not configured for this browser.");
    return { tokenSource: "local", participantIdentity };
  }
  throw new Error(`Unknown VITE_LIVEKIT_TOKEN_SOURCE value: ${source}. Use "local" or "cloud".`);
}

/** Decodes the JWT payload (base64url) to sanity-check the identity the server signed. */
function decodeJwtIdentity(participantToken: string): string | undefined {
  const payload = participantToken.split(".")[1];
  if (!payload) return undefined;
  try {
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    // livekit-server-sdk serializes the AccessToken identity as the standard
    // JWT `sub` claim (verified against real tokens issued by the API).
    const decoded = JSON.parse(atob(base64)) as { sub?: unknown; identity?: unknown };
    if (typeof decoded.sub === "string" && decoded.sub.length > 0) return decoded.sub;
    return typeof decoded.identity === "string" ? decoded.identity : undefined;
  } catch {
    return undefined;
  }
}

function parseAgentState(participant: RemoteParticipant, onAgentState?: (state: string) => void) {
  const state = participant.attributes["lk.agent.state"];
  if (state) onAgentState?.(state);
}

export function createLiveKitWebClient(options: LiveKitWebClientOptions = {}): VoiceClient {
  let room: Room | undefined;
  let bound = false;
  let boundConversationId: string | undefined;
  let manuallyDisconnected = false;
  let reconnecting = false;
  let agentIdentity: string | undefined;
  // Server-owned room name (set by the local token source; the frontend never derives it).
  let roomName: string | undefined;
  const attachedAudio = new Set<HTMLMediaElement>();

  const handleTrackSubscribed = (track: { kind: Track.Kind; attach: () => HTMLMediaElement }) => {
    if (track.kind !== Track.Kind.Audio) return;
    const element = track.attach();
    element.autoplay = true;
    element.setAttribute("aria-hidden", "true");
    document.body.appendChild(element);
    attachedAudio.add(element);
  };

  const handleTrackUnsubscribed = (track: { detach: () => HTMLMediaElement[] }) => {
    for (const element of track.detach()) {
      attachedAudio.delete(element);
      element.remove();
    }
  };

  function stopAgentAudio() {
    for (const element of attachedAudio) element.remove();
    attachedAudio.clear();
  }

  async function connect() {
    const config = readConfig(options);
    const binding = await api.createLiveVoiceBinding(options.getConversationId?.() ?? undefined);
    let credentials: { serverUrl: string; participantToken: string };
    if (config.tokenSource === "local") {
      // The local source asks our own API for the room token: room name, identity,
      // grants, and agent dispatch are all decided server-side.
      const roomToken = await api.fetchVoiceRoomToken(binding.conversationId);
      const tokenIdentity = decodeJwtIdentity(roomToken.participantToken);
      if (tokenIdentity !== config.participantIdentity)
        throw new Error("Live voice token identity does not match this browser.");
      roomName = roomToken.roomName;
      credentials = roomToken;
    } else {
      credentials = await TokenSource.developmentTokenServer(config.tokenServerId).fetch({
        roomName: `nani-${binding.conversationId}`,
        participantIdentity: config.participantIdentity,
        agentName: config.agentName,
      });
    }
    room = options.room ?? new Room({ adaptiveStream: true, dynacast: true });
    manuallyDisconnected = false;
    room.on(RoomEvent.TrackSubscribed, handleTrackSubscribed);
    room.on(RoomEvent.TrackUnsubscribed, handleTrackUnsubscribed);
    room.on(RoomEvent.Reconnecting, () => {
      if (reconnecting) return;
      reconnecting = true;
      stopAgentAudio();
      void room?.localParticipant.setMicrophoneEnabled(false);
      options.onConnectionLost?.();
    });
    room.on(RoomEvent.Reconnected, () => {
      reconnecting = false;
      // The hook restores the previous preference after it refreshes the
      // canonical conversation state. Reconnect must not replay microphone
      // audio before that state is current.
      options.onReconnected?.();
    });
    room.on(RoomEvent.Disconnected, () => {
      stopAgentAudio();
      if (!manuallyDisconnected && !reconnecting) options.onConnectionLost?.();
    });
    room.on(RoomEvent.DataReceived, (payload, _participant, _kind, topic) => {
      if (topic !== "conversation_state_changed") return;
      try {
        const event = JSON.parse(new TextDecoder().decode(payload)) as {
          conversationId?: unknown;
          revision?: unknown;
        };
        if (event.conversationId !== boundConversationId) return;
        if (typeof event.revision === "number") options.onRevision?.(event.revision);
      } catch {
        // Ignore malformed room data. Canonical state remains available through Fastify.
      }
    });
    room.on(RoomEvent.ParticipantAttributesChanged, (changed, participant) => {
      if (changed["lk.agent.state"])
        parseAgentState(participant as RemoteParticipant, options.onAgentState);
    });
    try {
      await room.connect(credentials.serverUrl, credentials.participantToken, {
        autoSubscribe: true,
      });
      // Publish before binding so the agent input stream sees the track when it starts.
      const microphone = await room.localParticipant.setMicrophoneEnabled(true);
      if (!microphone) throw new Error("Microphone track was not published.");
      const agent = await waitForAgent(room);
      agentIdentity = agent.identity;
      parseAgentState(agent, options.onAgentState);
      const response = await room.localParticipant.performRpc({
        destinationIdentity: agent.identity,
        method: "bind_conversation",
        payload: JSON.stringify({ bindingToken: binding.bindingToken }),
        responseTimeout: 10_000,
      });
      const result = JSON.parse(response) as {
        ok?: boolean;
        conversationId?: string;
        revision?: number;
        code?: string;
      };
      if (!result.ok || !result.conversationId || typeof result.revision !== "number") {
        throw new Error(
          result.code === "conversation_already_live"
            ? "This conversation is already open."
            : "Live voice could not be bound.",
        );
      }
      bound = true;
      boundConversationId = result.conversationId;
      options.onConversationBound?.(result.conversationId);
      options.onRevision?.(result.revision);
      return { conversationId: result.conversationId, revision: result.revision };
    } catch (error) {
      manuallyDisconnected = true;
      reconnecting = false;
      agentIdentity = undefined;
      await room.disconnect();
      room = undefined;
      const mediaFailure = MediaDeviceFailure.getFailure(error);
      if (mediaFailure === MediaDeviceFailure.PermissionDenied)
        throw new Error("microphone_permission_denied", { cause: error });
      if (mediaFailure === MediaDeviceFailure.NotFound)
        throw new Error("microphone_not_found", { cause: error });
      if (mediaFailure === MediaDeviceFailure.DeviceInUse)
        throw new Error("microphone_in_use", { cause: error });
      throw error;
    }
  }

  return {
    connect,
    setMicrophoneEnabled: async (enabled) => {
      if (!room || !bound) throw new Error("Live voice is not bound.");
      await room.localParticipant.setMicrophoneEnabled(enabled);
    },
    interruptAgentSpeech: async () => {
      if (!room || !bound) return;
      if (!agentIdentity) throw new Error("Live voice agent is not connected.");
      await room.localParticipant.performRpc({
        destinationIdentity: agentIdentity,
        method: "interrupt_agent",
        payload: "{}",
        responseTimeout: 5_000,
      });
    },
    pauseForLifecycle: async () => {
      if (room && bound) await room.localParticipant.setMicrophoneEnabled(false);
    },
    disconnect: async () => {
      manuallyDisconnected = true;
      bound = false;
      boundConversationId = undefined;
      agentIdentity = undefined;
      roomName = undefined;
      stopAgentAudio();
      await room?.disconnect();
      room = undefined;
    },
  };
}

async function waitForAgent(room: Room): Promise<RemoteParticipant> {
  const current = [...room.remoteParticipants.values()].find((participant) => participant.isAgent);
  if (current) return current;
  return new Promise<RemoteParticipant>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      room.off(RoomEvent.ParticipantConnected, onConnected);
      reject(new Error("Nani did not join the LiveKit room."));
    }, 10_000);
    const onConnected = (participant: RemoteParticipant) => {
      if (!participant.isAgent) return;
      window.clearTimeout(timeout);
      room.off(RoomEvent.ParticipantConnected, onConnected);
      resolve(participant);
    };
    room.on(RoomEvent.ParticipantConnected, onConnected);
  });
}
