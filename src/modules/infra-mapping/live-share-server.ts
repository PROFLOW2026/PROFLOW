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
 * Tokens are least-privilege: the host may publish a camera-source video track and nothing else (no
 * audio source, no data); the viewer may only subscribe. No egress / recording is ever started.
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

  async issueToken({ room, identity, role, ttlSeconds }) {
    const { apiKey, apiSecret } = required();
    const token = new AccessToken(apiKey, apiSecret, { identity, ttl: ttlSeconds });
    token.addGrant(
      role === 'host'
        ? {
            roomJoin: true,
            room,
            canPublish: true,
            canPublishSources: [TrackSource.CAMERA],
            canSubscribe: false,
            canPublishData: false,
          }
        : { roomJoin: true, room, canPublish: false, canSubscribe: true, canPublishData: false },
    );
    return token.toJwt();
  },

  async roomState(room) {
    const client = roomClient();
    const rooms = await client.listRooms([room]);
    if (rooms.length === 0) return { exists: false, viewerIdentities: [] };
    const participants = await client.listParticipants(room);
    return {
      exists: true,
      viewerIdentities: participants
        .map((participant) => participant.identity)
        .filter((identity) => identity.startsWith(LIVE_SHARE.viewerIdentityPrefix)),
    };
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
