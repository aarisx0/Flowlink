/**
 * Shared TypeScript types for FlowLink
 * Used by frontend and backend
 */

export type DeviceType = 'phone' | 'laptop' | 'desktop' | 'tablet';

export type IntentType = 
  | 'file_handoff'
  | 'media_continuation'
  | 'tab_handoff'
  | 'tab_collection_handoff'
  | 'link_open'
  | 'prompt_injection'
  | 'clipboard_sync'
  | 'remote_access_request'
  | 'batch_file_handoff'
  | 'session_invitation'
  | 'invitation_response'
  | 'nearby_session_notification'
  | 'chat_message';

export type PermissionType = 
  | 'files'
  | 'media'
  | 'prompts'
  | 'clipboard'
  | 'remote_browse';

export type TransferDirection = 'sending' | 'receiving';

export interface FileTransferStatus {
  fileName: string;
  direction: TransferDirection;
  progress: number;
  totalBytes: number;
  transferredBytes: number;
  speedBytesPerSec: number;
  etaSeconds: number;
  startedAt: number;
  completed?: boolean;
}

export interface Device {
  id: string;
  name: string;
  username: string; // User-provided username
  type: DeviceType;
  online: boolean;
  permissions: PermissionSet;
  joinedAt: number;
  lastSeen: number;
}

export interface PermissionSet {
  files: boolean;
  media: boolean;
  prompts: boolean;
  clipboard: boolean;
  remote_browse: boolean;
}

export interface Session {
  id: string;
  code: string; // 6-digit code
  createdBy: string; // device ID
  createdAt: number;
  expiresAt: number;
  devices: Map<string, Device>;
  groups?: Map<string, Group>; // Device groups
}

export interface Group {
  id: string;
  name: string;
  deviceIds: string[]; // Array of device IDs in this group
  createdBy: string; // device ID of creator
  createdAt: number;
  color?: string; // Optional color for UI
}

export interface Intent {
  intent_type: IntentType;
  payload: IntentPayload;
  target_device: string;
  source_device: string;
  auto_open: boolean;
  timestamp: number;
}

export interface IntentPayload {
  // File handoff (single file)
  file?: {
    name: string;
    size: number;
    type: string;
    data?: ArrayBuffer | Blob | number[];
    path?: string; // For remote file access
    localRef?: unknown; // Runtime-only handle for local file objects on sender
  };
  
  // Batch file handoff (multiple files)
  files?: {
    batchId: string; // Unique identifier for this batch
    totalFiles: number;
    totalSize: number;
    files: Array<{
      id: string; // Unique file ID within batch
      name: string;
      size: number;
      type: string;
      data?: ArrayBuffer | Blob | number[];
      path?: string;
      localRef?: unknown; // Runtime-only handle for local file objects on sender
    }>;
  };
  
  // Media continuation
  media?: {
    url: string;
    type: 'video' | 'audio';
    timestamp?: number; // Playback position in seconds
    state?: 'play' | 'pause';
  };
  
  // Link open
  link?: {
    url: string;
    title?: string;
  };

  // Tab handoff
  tab_handoff?: {
    tabs: Array<{
      url: string;
      title?: string;
      favIconUrl?: string;
      scrollX?: number;
      scrollY?: number;
      scrollProgress?: number;
      viewportHeight?: number;
      documentHeight?: number;
      mediaTimestamp?: number;
      mediaPaused?: boolean;
      selectionText?: string;
      pageTitle?: string;
      capturedAt?: number;
    }>;
    activeIndex?: number;
    collectionTitle?: string;
    sourceUsername?: string;
    sourceDeviceName?: string;
    sentAt?: number;
  };
  
  // Prompt injection
  prompt?: {
    text: string;
    context?: string; // Additional context
    target_app?: string; // e.g., 'editor', 'browser'
  };
  
  // Clipboard sync
  clipboard?: {
    text: string;
    html?: string;
  };
  
  // Remote access request
  request?: {
    action: 'start_screen_share' | 'stop_screen_share';
    viewerDeviceId?: string;
  };

  // Session invitation
  invitation?: {
    sessionId: string;
    sessionCode: string;
    inviterUsername: string;
    inviterDeviceName: string;
    message?: string;
  };

  // Invitation response
  invitationResponse?: {
    sessionId: string;
    accepted: boolean;
    inviteeUsername: string;
    inviteeDeviceName: string;
  };

  // Nearby session notification
  nearbySession?: {
    sessionId: string;
    sessionCode: string;
    creatorUsername: string;
    creatorDeviceName: string;
    deviceCount: number;
  };

  // Chat messages
  chat?: {
    messageId: string;
    text: string;
    username: string;
    sentAt: number;
    format?: 'plain' | 'markdown';
  };
}

export interface WebSocketMessage {
  type: MessageType;
  sessionId?: string;
  deviceId?: string;
  payload: any;
  timestamp: number;
}

export type MessageType =
  | 'session_create'
  | 'session_join'
  | 'session_leave'
  | 'session_expired'
  | 'device_connected'
  | 'device_disconnected'
  | 'device_status_update'
  | 'intent_send'
  | 'intent_received'
  | 'intent_accepted'
  | 'intent_rejected'
  | 'file_transfer_request'
  | 'file_transfer_chunk'
  | 'file_transfer_complete'
  | 'file_transfer_cancel'
  | 'webrtc_offer'
  | 'webrtc_answer'
  | 'webrtc_ice_candidate'
  | 'permission_request'
  | 'permission_granted'
  | 'permission_denied'
  | 'group_create'
  | 'group_update'
  | 'group_delete'
  | 'group_broadcast'
  | 'group_created'
  | 'group_updated'
  | 'group_deleted'
  | 'session_invitation'
  | 'invitation_response'
  | 'nearby_session_broadcast'
  | 'tab_handoff'
  | 'tab_handoff_offer'
  | 'notification'
  | 'chat_message'
  | 'chat_delivered'
  | 'chat_seen'
  | 'chat_typing'
  | 'error';

export interface WebRTCSignal {
  type: 'offer' | 'answer' | 'ice-candidate';
  sessionId: string;
  fromDevice: string;
  toDevice: string;
  data: RTCSessionDescriptionInit | RTCIceCandidateInit;
}


// Notification types
export interface NotificationData {
  id: string;
  type: 'session_invitation' | 'nearby_session' | 'device_joined' | 'file_received' | 'general';
  title: string;
  message: string;
  timestamp: number;
  data?: any;
  actions?: NotificationAction[];
}

export interface NotificationAction {
  id: string;
  label: string;
  action: 'accept' | 'reject' | 'join' | 'dismiss';
}

// User profile for username management
export interface UserProfile {
  username: string;
  deviceId: string;
  deviceName: string;
  deviceType: DeviceType;
  createdAt: number;
}
