/**
 * Centralized signaling configuration for FlowLink (Web).
 *
 * IMPORTANT:
 * - Automatically detects backend server IP/port based on window.location.host
 * - Supports both localhost development and remote connections
 * - For development, will try localhost:8080 first, then fallback to current host
 * - For production, uses the current host domain/IP with port 8080
 */
function getSignalingWsUrl(): string {
  // First, check for environment variable override
  const envUrl = (import.meta as any)?.env?.VITE_SIGNALING_URL as string | undefined;
  if (envUrl) {
    console.log('Using VITE_SIGNALING_URL:', envUrl);
    return envUrl;
  }

  // Get current host (domain or IP)
  const currentHost = window.location.host;
  const currentHostname = window.location.hostname;
  const currentProtocol = window.location.protocol;
  
  // Determine if we're on localhost
  const isLocalhost = currentHostname === 'localhost' || currentHostname === '127.0.0.1' || currentHostname.startsWith('127.');
  
  // Construct WebSocket URL
  let wsUrl: string;
  
  if (isLocalhost) {
    // Development on localhost
    // Default to ws://localhost:8080
    wsUrl = 'ws://localhost:8080';
    console.log('Detected localhost environment, using:', wsUrl);
  } else {
    // Production or remote connection
    // Use the same host as the frontend, with port 8080
    const protocol = currentProtocol === 'https:' ? 'wss:' : 'ws:';
    const hostname = currentHostname;
    const port = 8080;
    wsUrl = `${protocol}//${hostname}:${port}`;
    console.log('Detected remote/production environment, using:', wsUrl);
  }
  
  return wsUrl;
}

export const SIGNALING_WS_URL = getSignalingWsUrl();

export const SIGNALING_HTTP_URL = SIGNALING_WS_URL.replace(/^ws:\/\//, 'http://')
  .replace(/^wss:\/\//, 'https://');

// Utility function to update the URL if needed
export function updateSignalingUrl(newUrl: string): void {
  const urlObj = new URL(newUrl);
  console.log('Updating signaling URL to:', newUrl);
}


