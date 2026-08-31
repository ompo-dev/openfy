/**
 * Media identity types — "what the content is", never "how to play it".
 *
 * A MediaReference uniquely identifies a piece of content from its source.
 * It carries no stream URL, no auth headers, no expiry. Those concerns belong
 * to YouTubeStreamDescriptor (resolved by YouTubeStreamResolver).
 *
 * Architecture:
 *   Source/Catalog layer → MediaReference → videoId
 *                                              ↓
 *                                   YouTubeStreamResolver
 *                                              ↓
 *                                   YouTubeStreamDescriptor
 *                                              ↓
 *                                   Native Streaming Engine
 */

export type MediaReference =
  | { source: 'youtube';  type: 'video';    videoId: string }
  | { source: 'youtube';  type: 'playlist'; playlistId: string }
  | { source: 'ytmusic';  type: 'track';    videoId: string }
  | { source: 'ytmusic';  type: 'album';    browseId: string }
  | { source: 'ytmusic';  type: 'playlist'; playlistId: string }
  | { source: 'spotify';  type: 'track';    spotifyId: string }
  | { source: 'spotify';  type: 'album';    spotifyId: string }
  | { source: 'spotify';  type: 'playlist'; spotifyId: string };

/**
 * A resolved, playable stream descriptor. All fields needed to fetch audio
 * bytes are present; the caller never needs to know which player client
 * produced this URL.
 */
export type YouTubeStreamDescriptor = {
  videoId: string;
  url: string;
  /** HTTP headers that must accompany every range request to GVS. */
  headers: Record<string, string>;
  format: 'mp4' | 'webm';
  /** The player client identity that minted this URL. */
  client: 'IOS' | 'YTMUSIC_ANDROID' | 'ANDROID_VR' | 'TV';
  /** Unix ms after which this descriptor should not be used. */
  expiresAt: number;
  /**
   * Opaque session key — hash of (client + visitorData).
   * Used to detect when a cached PO Token is no longer valid for this descriptor.
   */
  sessionKey: string;
};

/**
 * Typed outcome of resolveYouTubeStream(). Never `null` — callers can
 * pattern-match the status to decide how to handle each failure mode.
 *
 * 'resolved'                — happy path; stream field is present
 * 'attestation_required'    — GVS PO Token enforcement (probe.second 403)
 * 'authentication_required' — video requires YouTube login
 * 'temporarily_blocked'     — all player clients in cooldown; retry after retryAt
 * 'unplayable'              — video is unavailable/private/removed on YouTube
 * 'transport_error'         — network or timeout failure
 */
export type StreamResolveResult =
  | { status: 'resolved';                stream: YouTubeStreamDescriptor }
  | { status: 'attestation_required';    videoId: string; client: string }
  | { status: 'authentication_required'; videoId: string }
  | { status: 'temporarily_blocked';     videoId: string; retryAt: number }
  | { status: 'unplayable';              videoId: string; reason: string }
  | { status: 'transport_error';         videoId: string; error: string };
