import 'server-only';

import { AccessToken, RoomServiceClient, TrackSource } from 'livekit-server-sdk';
import { serverEnv } from '@/shared/env/server';
import { LIVE_SHARE } from './domain/live-share';
import { newLiveShareSessionId } from './application/live-share-token';
import type { LiveShareDeps, LiveShareGateway } from './application/live-share';

/**
 * Production wiring of live camera sharing: LiveKit, configured ONLY through server environment
 * variables (`LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`). The API key / secret never reach
 * the browser: the browser only ever gets the WebSocket URL and a short-lived, room-scoped token.
 *
 * Tokens are least-privilege: the host may publish a camera-source video track (no audio source) plus its small
 * control messages; the viewer may only subscribe and is view-only until the broadcaster approves remote
 * marking (then it may also send small control messages, never tracks). No egress / recording is ever started.
 */

interface LiveKitConfig {
  readonly url: string;
  readonly apiKey: string;
  readonly apiSecret: string;
}

function config(): LiveKitConfig | null {
  const env = serverEnv();
  if (!env.LIVEKIT_URL || !env.LIVEKIT_API_KEY || !env.LIVEKIT_API_SECRET) return null;
  return { url: env.LIVEKIT_URL, apiKey: env.LIVEKIT_API_KEY, apiSecret: env.LIVEKIT_API_SECRET };
}

function required(): LiveKitConfig {
  const value = config();
  if (!value) throw new Error('LiveKit is not configured');
  return value;
}

/** The server API speaks HTTP(S) on the same host as the WebSocket URL. */
function httpUrl(url: string): string {
  return url.replace(/^wss:/i, 'https:').replace(/^ws:/i, 'http:');
}

function roomClient(): RoomServiceClient {
  const { url, apiKey, apiSecret } = required();
  return new RoomServiceClient(httpUrl(url), apiKey, apiSecret);
}

/** The room metadata is `{"control":true}` while remote marking is approved; anything else means view-only. */
function readControlFlag(metadata: string | undefined): boolean {
  if (!metadata) return false;
  try {
    return (JSON.parse(metadata) as { control?: unknown }).control === true;
  } catch {
    return false;
  }
}

export const liveShareGateway: LiveShareGateway = {
  isConfigured: () => config() !== null,
  serverUrl: () => required().url,
  signingSecret: () => required().apiSecret,

  async createRoom(room) {
    await roomClient().createRoom({
      name: room,
      maxParticipants: LIVE_SHARE.maxParticipants,
      emptyTimeout: LIVE_SHARE.emptyTimeoutSeconds,
      departureTimeout: LIVE_SHARE.departureTimeoutSeconds,
    });
  },

  async issueToken({ room, identity, role, ttlSeconds, controlEnabled }) {
    const { apiKey, apiSecret } = required();
    const token = new AccessToken(apiKey, apiSecret, { identity, ttl: ttlSeconds });
    token.addGrant(
      role === 'host'
        ? {
            roomJoin: true,
            room,
            canPublish: true,
            canPublishSources: [TrackSource.CAMERA],
            // The broadcaster sends its small state messages and listens for the viewer's control messages.
            canSubscribe: true,
            canPublishData: true,
          }
        : {
            roomJoin: true,
            room,
            canPublish: false,
            canSubscribe: true,
            // View-only unless the broadcaster approved remote marking for this session.
            canPublishData: controlEnabled === true,
          },
    );
    return token.toJwt();
  },

  async roomState(room) {
    const client = roomClient();
    const rooms = await client.listRooms([room]);
    if (rooms.length === 0) return { exists: false, hostPresent: false, viewerIdentities: [], controlEnabled: false };
    const participants = await client.listParticipants(room);
    return {
      exists: true,
      controlEnabled: readControlFlag(rooms[0]?.metadata),
      hostPresent: participants.some((participant) => participant.identity === LIVE_SHARE.hostIdentity),
      viewerIdentities: participants
        .map((participant) => participant.identity)
        .filter((identity) => identity.startsWith(LIVE_SHARE.viewerIdentityPrefix)),
    };
  },

  async setControl(room, enabled) {
    const client = roomClient();
    // The grant is remembered in the room itself (a viewer that reconnects gets a token that matches it)...
    await client.updateRoomMetadata(room, JSON.stringify({ control: enabled }));
    // ...and applied at once to a viewer that is already inside. Permissions are replaced atomically.
    const participants = await client.listParticipants(room);
    for (const participant of participants) {
      if (!participant.identity.startsWith(LIVE_SHARE.viewerIdentityPrefix)) continue;
      await client.updateParticipant(room, participant.identity, {
        permission: { canSubscribe: true, canPublish: false, canPublishData: enabled, canPublishSources: [] },
      });
    }
  },

  async deleteRoom(room) {
    await roomClient().deleteRoom(room);
  },
};

export const liveShareDeps: LiveShareDeps = {
  gateway: liveShareGateway,
  nowSeconds: () => Math.floor(Date.now() / 1000),
  newSessionId: newLiveShareSessionId,
};
