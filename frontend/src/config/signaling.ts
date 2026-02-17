/**
 * Centralized signaling configuration for FlowLink (Web).
 *
 * IMPORTANT:
 * - Never hardcode localhost in signaling URLs (breaks LAN + devices/emulators).
 * - Configure via Vite env: VITE_SIGNALING_URL (e.g. wss://flowlink-production.up.railway.app)
 * - Uses secure WebSocket (wss) for production Railway deployment
 */
function getSignalingWsUrl(): string {
  const envUrl = (import.meta as any)?.env?.VITE_SIGNALING_URL as string | undefined;
  // Default to local development backend
  return envUrl || 'wss://sparkling-courtesy-production-1cb0.up.railway.app';
}

export const SIGNALING_WS_URL = getSignalingWsUrl();

export const SIGNALING_HTTP_URL = SIGNALING_WS_URL.replace(/^ws:\/\//, 'http://')
  .replace(/^wss:\/\//, 'https://');

