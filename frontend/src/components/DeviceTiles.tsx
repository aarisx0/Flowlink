import { useState, useEffect, useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Session, Device, Intent, Group } from '@shared/types';
import DeviceTile from './DeviceTile';
import GroupManager from './GroupManager';
import GroupTile from './GroupTile';
import IntentRouter from '../services/IntentRouter';
import WebRTCManager from '../services/WebRTCManager';
import FileBridge from '../services/FileBridge';
import ContinuityEngine from '../services/ContinuityEngine';
import PermissionEngine from '../services/PermissionEngine';
import MediaDetector from '../services/MediaDetector';
import { groupService } from '../services/GroupService';
import InvitationService from '../services/InvitationService';
import InvitationPanel from './InvitationPanel';
import './DeviceTiles.css';

interface DeviceTilesProps {
  session: Session;
  deviceId: string;
  deviceName: string;
  deviceType: 'phone' | 'laptop' | 'desktop' | 'tablet';
  username: string;
  invitationService: InvitationService | null;
  onLeaveSession: () => void;
}

export default function DeviceTiles({
  session,
  deviceId,
  deviceName,
  deviceType,
  username,
  invitationService,
  onLeaveSession,
}: DeviceTilesProps) {
  const [devices, setDevices] = useState<Map<string, Device>>(() => {
    // Initialize with devices from session, excluding self
    const initialDevices = new Map<string, Device>();
    console.log('🚀 DeviceTiles initializing');
    console.log('Session ID:', session.id);
    console.log('Session code:', session.code);
    console.log('Session createdBy:', session.createdBy);
    console.log('Session devices size:', session.devices.size);
    console.log('Current deviceId (self):', deviceId);
    
    session.devices.forEach((device, id) => {
      console.log(`Device in session: ${id} = ${device.name} (${device.type})`);
      if (id !== deviceId) {
        console.log(`  ✅ Adding to initial map`);
        initialDevices.set(id, device);
      } else {
        console.log(`  ⏭️ Skipping (self)`);
      }
    });
    
    console.log('Initial devices map size:', initialDevices.size);
    console.log('Initial devices:', Array.from(initialDevices.entries()).map(([id, d]) => `${id.substring(0, 8)}...: ${d.name}`));
    return initialDevices;
  });
  const [groups, setGroups] = useState<Group[]>([]);
  const [draggedItem, setDraggedItem] = useState<any>(null);
  const [showInvitationPanel, setShowInvitationPanel] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const webrtcManagerRef = useRef<WebRTCManager | null>(null);
  const intentRouterRef = useRef<IntentRouter | null>(null);
  const fileBridgeRef = useRef<FileBridge | null>(null);
  const continuityEngineRef = useRef<ContinuityEngine | null>(null);
  const permissionEngineRef = useRef<PermissionEngine | null>(null);
  const mediaDetectorRef = useRef<MediaDetector | null>(null);

  useEffect(() => {
    // Store session info for RemoteAccess component
    sessionStorage.setItem('sessionId', session.id);
    sessionStorage.setItem('sessionCode', session.code);
    sessionStorage.setItem('deviceId', deviceId);
    sessionStorage.setItem('username', username);
    sessionStorage.setItem('deviceName', deviceName);
    sessionStorage.setItem('deviceType', deviceType);
    
    // Use the App-level WebSocket instead of creating a new one
    const ws = (window as any).appWebSocket;
    if (ws && ws.readyState === WebSocket.OPEN) {
      console.log('DeviceTiles using App-level WebSocket, rejoining session:', session.code);
      wsRef.current = ws;
      
      // Re-join session to get updates
      ws.send(JSON.stringify({
        type: 'session_join',
        payload: {
          code: session.code,
          deviceId,
          deviceName,
          deviceType,
          username,
        },
        timestamp: Date.now(),
      }));
    } else {
      console.error('App-level WebSocket not available in DeviceTiles');
    }

    // Add message listener for DeviceTiles-specific messages
    const handleDeviceTilesMessage = (event: MessageEvent) => {
      const message = JSON.parse(event.data);
      // Only handle messages that DeviceTiles cares about
      if (['device_connected', 'device_disconnected', 'device_status_update', 
           'intent_received', 'intent_accepted', 'intent_rejected',
           'group_created', 'group_updated', 'group_deleted'].includes(message.type)) {
        handleWebSocketMessage(message);
      }
    };

    if (ws) {
      ws.addEventListener('message', handleDeviceTilesMessage);
    }

    // Initialize WebRTC Manager
    webrtcManagerRef.current = new WebRTCManager(ws, deviceId, session.id);

    // Initialize services
    fileBridgeRef.current = new FileBridge(webrtcManagerRef.current);
    continuityEngineRef.current = new ContinuityEngine(webrtcManagerRef.current, deviceId);
    permissionEngineRef.current = new PermissionEngine();
    mediaDetectorRef.current = new MediaDetector();

    // Initialize Intent Router (WebRTC manager may fall back to WebSocket)
    intentRouterRef.current = new IntentRouter(
      deviceId,
      webrtcManagerRef.current,
      handleIntentSent
    );

    // Initialize Group Service
    groupService.initialize(ws, session.id, deviceId);
    groupService.subscribe(setGroups);

    return () => {
      if (ws) {
        ws.removeEventListener('message', handleDeviceTilesMessage);
      }
      webrtcManagerRef.current?.cleanup();
      permissionEngineRef.current?.revokeAll();
      mediaDetectorRef.current?.cleanup();
      groupService.cleanup();
    };
  }, [session.code, deviceId, deviceName, deviceType, username]);

  const handleWebSocketMessage = (message: any) => {
    console.log('DeviceTiles received message:', message.type, message);
    switch (message.type) {
      case 'device_connected':
        const newDevice: Device = message.payload.device;
        console.log('Device connected:', newDevice);
        setDevices((prev) => {
          const updated = new Map(prev);
          updated.set(newDevice.id, newDevice);
          console.log('Updated devices map:', Array.from(updated.keys()));
          return updated;
        });
        
        // Show notification for new device
        if (newDevice.username && invitationService) {
          invitationService.showDeviceJoined(newDevice.username, newDevice.name);
        }
        break;

      case 'device_disconnected':
        setDevices((prev) => {
          const updated = new Map(prev);
          const deviceId = message.payload.deviceId;
          // Remove the device tile entirely when it disconnects
          updated.delete(deviceId);
          console.log('Device disconnected and removed:', deviceId);
          return updated;
        });
        break;

      case 'device_status_update':
        setDevices((prev) => {
          const updated = new Map(prev);
          const device = message.payload.device;
          updated.set(device.id, device);
          return updated;
        });
        break;

      case 'intent_received':
        handleIncomingIntent(message.payload.intent, message.payload.sourceDevice);
        break;

      case 'session_invitation':
        // Handle incoming session invitation
        const invitation = message.payload.invitation;
        if (invitationService) {
          invitationService.handleIncomingInvitation(invitation);
          // Store invitation data for potential acceptance
          invitationService.storeInvitationData(invitation.sessionId, invitation.sessionCode);
        }
        break;

      case 'nearby_session_broadcast':
        // Handle nearby session notification
        const nearbySession = message.payload.nearbySession;
        if (invitationService) {
          invitationService.handleNearbySession(nearbySession);
          // Store session data for potential joining
          invitationService.storeInvitationData(nearbySession.sessionId, nearbySession.sessionCode);
        }
        break;

      case 'invitation_response':
        // Handle invitation response (accepted/rejected)
        const response = message.payload;
        if (invitationService) {
          if (response.accepted) {
            invitationService.notificationService.showToast({
              type: 'success',
              title: 'Invitation Accepted',
              message: `${response.inviteeUsername} accepted your invitation`,
              duration: 4000,
            });
          } else {
            invitationService.notificationService.showToast({
              type: 'info',
              title: 'Invitation Declined',
              message: `${response.inviteeUsername} declined your invitation`,
              duration: 3000,
            });
          }
        }
        break;

      case 'invitation_sent':
        // Handle invitation sent confirmation
        const sentResponse = message.payload;
        if (invitationService) {
          invitationService.notificationService.showToast({
            type: 'success',
            title: 'Invitation Sent',
            message: `Invitation sent to ${sentResponse.targetUsername || sentResponse.targetIdentifier}`,
            duration: 3000,
          });
        }
        break;

      case 'session_expired':
        alert('Session has expired. Returning to session manager.');
        // Clear all devices immediately
        setDevices(new Map());
        handleLeaveSession();
        break;
      
      case 'session_joined':
        // Update devices list from backend response
        if (message.payload && message.payload.devices) {
          const deviceMap = new Map<string, Device>();
          message.payload.devices.forEach((d: any) => {
            // Include all devices except self
            if (d.id !== deviceId) {
              deviceMap.set(d.id, {
                id: d.id,
                name: d.name,
                username: d.username || 'Unknown',
                type: d.type,
                online: d.online,
                permissions: d.permissions || {
                  files: false,
                  media: false,
                  prompts: false,
                  clipboard: false,
                  remote_browse: false,
                },
                joinedAt: d.joinedAt || Date.now(),
                lastSeen: d.lastSeen || Date.now(),
              });
            }
          });
          setDevices(deviceMap);
          console.log('Updated devices from session_joined:', Array.from(deviceMap.keys()));
        }
        // Update groups list
        if (message.payload && message.payload.groups) {
          groupService.setGroups(message.payload.groups);
        }
        break;

      case 'group_created':
        groupService.addGroup(message.payload.group);
        break;

      case 'group_updated':
        groupService.updateGroup(message.payload.group);
        break;

      case 'group_deleted':
        groupService.removeGroup(message.payload.groupId);
        break;
    }
  };

  const handleIncomingIntent = async (intent: Intent, sourceDevice: string) => {
    console.log('📨 Incoming intent');
    console.log('  Intent type:', intent.intent_type);
    console.log('  Source device ID:', sourceDevice);
    console.log('  Current devices map size:', devices.size);
    console.log('  Devices in map:', Array.from(devices.entries()).map(([id, d]) => `${id.substring(0, 8)}...: ${d.name}`));
    
    // Show permission request UI
    const granted = await requestPermission(intent, sourceDevice);
    
    if (granted) {
      // Grant permission based on intent type
      grantPermissionForIntent(intent, sourceDevice);
      
      // Process intent
      await processIntent(intent, sourceDevice);
      
      // Send acknowledgment
      if (wsRef.current) {
        wsRef.current.send(JSON.stringify({
          type: 'intent_accepted',
          sessionId: session.id,
          deviceId,
          payload: {
            intentId: intent.timestamp.toString(),
            sourceDevice,
          },
          timestamp: Date.now(),
        }));
      }
    } else {
      // Send rejection
      if (wsRef.current) {
        wsRef.current.send(JSON.stringify({
          type: 'intent_rejected',
          sessionId: session.id,
          deviceId,
          payload: {
            intentId: intent.timestamp.toString(),
            sourceDevice,
          },
          timestamp: Date.now(),
        }));
      }
    }
  };

  const grantPermissionForIntent = (intent: Intent, targetDeviceId: string) => {
    console.log('🔐 grantPermissionForIntent called');
    console.log('Intent type:', intent.intent_type);
    console.log('Target device ID:', targetDeviceId);
    console.log('Current devices:', Array.from(devices.keys()));
    
    setDevices((prev) => {
      const updated = new Map(prev);
      const device = updated.get(targetDeviceId);
      
      if (!device) {
        console.error('❌ Device not found in map:', targetDeviceId);
        console.log('Available devices:', Array.from(prev.keys()));
        return prev; // Return unchanged if device not found
      }
      
      console.log('✅ Device found:', device.name);
      const newDevice = { ...device };
      const currentPerms = { ...device.permissions };
      
      switch (intent.intent_type) {
        case 'file_handoff':
          currentPerms.files = true;
          console.log('Granting FILES permission');
          break;
        case 'batch_file_handoff':
          currentPerms.files = true;
          console.log('Granting FILES permission for batch transfer');
          break;
        case 'media_continuation':
          currentPerms.media = true;
          console.log('Granting MEDIA permission');
          break;
        case 'prompt_injection':
          currentPerms.prompts = true;
          console.log('Granting PROMPTS permission');
          break;
      case 'clipboard_sync':
        // Check if this is a remote access toggle request
        const clipboardText = intent.payload.clipboard?.text;
        if (clipboardText === 'ENABLE_REMOTE_ACCESS') {
          currentPerms.remote_browse = true;
          console.log('Granting REMOTE_BROWSE permission');
        } else if (clipboardText === 'DISABLE_REMOTE_ACCESS') {
          currentPerms.remote_browse = false;
          console.log('Revoking REMOTE_BROWSE permission');
        } else {
          currentPerms.clipboard = true;
          console.log('Granting CLIPBOARD permission');
        }
        break;
      case 'remote_access_request':
        // Remote access request doesn't grant a permission, it triggers screen sharing
        break;
        case 'link_open':
          // Links don't need special permission
          break;
      }
      
      newDevice.permissions = currentPerms;
      updated.set(targetDeviceId, newDevice);
      
      console.log('✅ Updated device permissions:', newDevice.permissions);
      console.log('✅ Device map after update:', Array.from(updated.keys()));
      
      // Notify backend of permission update
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: 'device_status_update',
          sessionId: session.id,
          deviceId,
          payload: {
            device: newDevice,
          },
          timestamp: Date.now(),
        }));
        console.log('✅ Sent device_status_update to backend');
      } else {
        // Fallback to App-level WebSocket
        const appWs = (window as any).appWebSocket;
        if (appWs && appWs.readyState === WebSocket.OPEN) {
          appWs.send(JSON.stringify({
            type: 'device_status_update',
            sessionId: session.id,
            deviceId,
            payload: {
              device: newDevice,
            },
            timestamp: Date.now(),
          }));
          console.log('✅ Sent device_status_update to backend via App WebSocket');
        } else {
          console.warn('⚠️ No WebSocket available, cannot send device_status_update');
        }
      }
      
      return updated;
    });
  };

  const requestPermission = (intent: Intent, sourceDevice: string): Promise<boolean> => {
    return new Promise((resolve) => {
      console.log('🔐 Requesting permission');
      console.log('  Source device ID:', sourceDevice);
      console.log('  Looking up in devices map...');
      
      const device = devices.get(sourceDevice);
      console.log('  Device found:', device ? `${device.name} (${device.type})` : 'NOT FOUND ❌');
      
      if (!device) {
        console.log('  Available devices in map:');
        devices.forEach((d, id) => {
          console.log(`    ${id.substring(0, 8)}...: ${d.name} (${d.type})`);
        });
      }
      
      const deviceName = device?.name || 'Unknown Device';
      
      const message = getPermissionMessage(intent, deviceName);
      const granted = window.confirm(message);
      resolve(granted);
    });
  };

  const getPermissionMessage = (intent: Intent, deviceName: string): string => {
    switch (intent.intent_type) {
      case 'file_handoff':
        return `${deviceName} wants to send you a file: ${intent.payload.file?.name}. Allow?`;
      case 'batch_file_handoff': {
        const files = intent.payload.files;
        if (!files) return `${deviceName} wants to send files. Allow?`;
        const totalSizeMB = (files.totalSize / 1024 / 1024).toFixed(2);
        const fileList = files.files.slice(0, 3).map(f => f.name).join(', ');
        const moreText = files.files.length > 3 ? ` and ${files.files.length - 3} more` : '';
        return `${deviceName} wants to send ${files.totalFiles} files (${totalSizeMB} MB):\n${fileList}${moreText}. Allow?`;
      }
      case 'media_continuation': {
        const rawMedia = intent.payload.media as any;
        let url = '';
        if (typeof rawMedia === 'string') {
          try {
            const mediaObj = JSON.parse(rawMedia);
            url = mediaObj.url || '';
          } catch {}
        } else {
          url = rawMedia?.url || '';
        }
        return `${deviceName} wants to continue playing media: ${url}. Allow?`;
      }
      case 'link_open': {
        const rawLink = intent.payload.link as any;
        let url = '';
        if (typeof rawLink === 'string') {
          try {
            const linkObj = JSON.parse(rawLink);
            url = linkObj.url || '';
          } catch {}
        } else {
          url = rawLink?.url || '';
        }
        return `${deviceName} wants to open a link: ${url}. Allow?`;
      }
      case 'prompt_injection':
        return `${deviceName} wants to send you a prompt: "${intent.payload.prompt?.text.substring(0, 50)}...". Allow?`;
      case 'clipboard_sync':
        return `${deviceName} wants to sync clipboard. Allow?`;
      case 'remote_access_request':
        return `${deviceName} wants to view your screen remotely. Allow screen sharing?`;
      default:
        return `${deviceName} wants to perform an action. Allow?`;
    }
  };

  const processIntent = async (intent: Intent, sourceDevice: string) => {
    switch (intent.intent_type) {
      case 'file_handoff':
        await handleFileHandoff(intent);
        break;
      case 'batch_file_handoff':
        await handleBatchFileHandoff(intent);
        break;
      case 'media_continuation':
        await handleMediaContinuation(intent);
        break;
      case 'link_open':
        await handleLinkOpen(intent);
        break;
      case 'prompt_injection':
        await handlePromptInjection(intent);
        break;
      case 'clipboard_sync':
        await handleClipboardSync(intent);
        break;
      case 'remote_access_request':
        await handleRemoteAccessRequest(intent, sourceDevice);
        break;
    }
  };

  const handleFileHandoff = async (intent: Intent) => {
    if (!intent.payload.file) return;
    
    // If file data is included, download it
    if (intent.payload.file.data) {
      // Convert array to Uint8Array
      let uint8Array: Uint8Array;
      if (intent.payload.file.data instanceof ArrayBuffer) {
        uint8Array = new Uint8Array(intent.payload.file.data);
      } else if (intent.payload.file.data instanceof Blob) {
        // For Blob, we need to read it as ArrayBuffer first
        const arrayBuffer = await intent.payload.file.data.arrayBuffer();
        uint8Array = new Uint8Array(arrayBuffer);
      } else {
        // It's a number array
        uint8Array = new Uint8Array(intent.payload.file.data);
      }
      const arrayBuffer = new ArrayBuffer(uint8Array.length);
      new Uint8Array(arrayBuffer).set(uint8Array);
      const blob = new Blob([arrayBuffer], { type: intent.payload.file.type });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = intent.payload.file.name;
      a.click();
      URL.revokeObjectURL(url);
      
      // Auto-open if permission granted
      if (intent.auto_open) {
        // Try to open file based on type
        if (intent.payload.file.type.startsWith('image/')) {
          window.open(url, '_blank');
        } else if (intent.payload.file.type.startsWith('text/')) {
          // For text files, open in new tab
          const reader = new FileReader();
          reader.onload = (e) => {
            const newWindow = window.open('', '_blank');
            if (newWindow) {
              newWindow.document.write(`
                <html>
                  <head><title>${intent.payload.file?.name || 'File'}</title></head>
                  <body style="font-family:monospace;padding:20px;white-space:pre-wrap;">${e.target?.result}</body>
                </html>
              `);
            }
          };
          reader.readAsText(blob);
        }
      }
    }
  };

  const handleBatchFileHandoff = async (intent: Intent) => {
    if (!intent.payload.files) return;
    
    const { totalFiles, totalSize, files } = intent.payload.files;
    
    console.log(`📦 Batch file transfer received: ${totalFiles} files, ${(totalSize / 1024 / 1024).toFixed(2)} MB`);
    
    // Show batch download confirmation
    const confirmed = window.confirm(
      `Receive ${totalFiles} files (${(totalSize / 1024 / 1024).toFixed(2)} MB)?\n\n` +
      `Files: ${files.slice(0, 3).map(f => f.name).join(', ')}${files.length > 3 ? ` and ${files.length - 3} more...` : ''}`
    );
    
    if (!confirmed) {
      console.log('Batch file transfer cancelled by user');
      return;
    }
    
    // Create a folder structure for batch downloads
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const folderName = `FlowLink-Batch-${timestamp}`;
    
    // Process each file in the batch
    let successCount = 0;
    let errorCount = 0;
    
    for (const file of files) {
      try {
        if (file.data) {
          // Convert array to Uint8Array
          let uint8Array: Uint8Array;
          if (file.data instanceof ArrayBuffer) {
            uint8Array = new Uint8Array(file.data);
          } else if (file.data instanceof Blob) {
            const arrayBuffer = await file.data.arrayBuffer();
            uint8Array = new Uint8Array(arrayBuffer);
          } else {
            // It's a number array
            uint8Array = new Uint8Array(file.data);
          }
          
          const arrayBuffer = new ArrayBuffer(uint8Array.length);
          new Uint8Array(arrayBuffer).set(uint8Array);
          const blob = new Blob([arrayBuffer], { type: file.type });
          const url = URL.createObjectURL(blob);
          
          // Download with folder prefix
          const a = document.createElement('a');
          a.href = url;
          a.download = `${folderName}/${file.name}`;
          a.click();
          URL.revokeObjectURL(url);
          
          successCount++;
          
          // Small delay between downloads to avoid browser blocking
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      } catch (error) {
        console.error(`Failed to download file ${file.name}:`, error);
        errorCount++;
      }
    }
    
    // Show completion status
    if (errorCount === 0) {
      console.log(`✅ Batch download complete: ${successCount} files downloaded`);
      // Show a brief success message
      const statusDiv = document.createElement('div');
      statusDiv.style.cssText = `
        position: fixed; top: 20px; right: 20px; z-index: 10000;
        background: #4CAF50; color: white; padding: 12px 20px;
        border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        font-family: system-ui; font-size: 14px;
      `;
      statusDiv.textContent = `✅ ${successCount} files downloaded successfully`;
      document.body.appendChild(statusDiv);
      setTimeout(() => statusDiv.remove(), 3000);
    } else {
      alert(`Batch download completed with errors:\n✅ ${successCount} successful\n❌ ${errorCount} failed`);
    }
  };

  const handleMediaContinuation = async (intent: Intent) => {
    if (!intent.payload.media) return;
    
    const { url, timestamp, state } = intent.payload.media;
    
    // If file data is included, create blob URL
    if (intent.payload.file && intent.payload.file.data) {
      let uint8Array: Uint8Array;
      if (intent.payload.file.data instanceof ArrayBuffer) {
        uint8Array = new Uint8Array(intent.payload.file.data);
      } else if (intent.payload.file.data instanceof Blob) {
        // For Blob, we need to read it as ArrayBuffer first
        const arrayBuffer = await intent.payload.file.data.arrayBuffer();
        uint8Array = new Uint8Array(arrayBuffer);
      } else {
        // It's a number array
        uint8Array = new Uint8Array(intent.payload.file.data);
      }
      const arrayBuffer = new ArrayBuffer(uint8Array.length);
      new Uint8Array(arrayBuffer).set(uint8Array);
      const blob = new Blob([arrayBuffer], { type: intent.payload.file.type });
      const blobUrl = URL.createObjectURL(blob);
      
      // Create video/audio element to play with timestamp
      if (intent.payload.media.type === 'video') {
        const video = document.createElement('video');
        video.src = blobUrl;
        video.controls = true;
        video.currentTime = timestamp || 0;
        if (state === 'play') {
          video.play().catch(console.error);
        }
        // Open in new window
        const newWindow = window.open('', '_blank');
        if (newWindow) {
          newWindow.document.write(`
            <html>
              <head><title>${intent.payload.file.name}</title></head>
              <body style="margin:0;padding:0;background:#000;display:flex;justify-content:center;align-items:center;height:100vh;">
                <video controls autoplay style="max-width:100%;max-height:100%;" src="${blobUrl}"></video>
                <script>
                  document.querySelector('video').currentTime = ${timestamp || 0};
                  ${state === 'play' ? "document.querySelector('video').play();" : ''}
                </script>
              </body>
            </html>
          `);
        }
      } else {
        // Audio
        const audio = new Audio(blobUrl);
        audio.currentTime = timestamp || 0;
        if (state === 'play') {
          audio.play().catch(console.error);
        }
        // For audio, we can play in background or show a simple player
        window.open(blobUrl, '_blank');
      }
      return;
    }
    
    // For URLs, open with timestamp
    let mediaUrl = url;
    if (timestamp && timestamp > 0) {
      // Add timestamp to URL
      const separator = url.includes('?') ? '&' : '#';
      if (url.includes('youtube.com') || url.includes('youtu.be')) {
        mediaUrl = `${url}${url.includes('?') ? '&' : '?'}t=${Math.floor(timestamp)}`;
      } else if (url.includes('spotify.com')) {
        // Spotify doesn't support timestamp in URL, but we can try
        mediaUrl = url;
      } else {
        mediaUrl = `${url}${separator}t=${timestamp}`;
      }
    }
    
    window.open(mediaUrl, '_blank');
  };

  const handleLinkOpen = async (intent: Intent) => {
    const rawLink = intent.payload.link as any;
    if (!rawLink) {
      console.warn('handleLinkOpen: missing link payload', intent);
      return;
    }

    try {
      // Android may send link payload as a JSON string; web sends it as an object.
      const linkObj =
        typeof rawLink === 'string'
          ? JSON.parse(rawLink)
          : rawLink;

      if (!linkObj.url) {
        console.warn('handleLinkOpen: link payload missing url', rawLink);
        return;
      }

      console.log('handleLinkOpen: opening URL from intent in new tab', linkObj.url);
      // Always try to open in a new tab so the FlowLink session page
      // stays open and connected. If the browser blocks the popup,
      // we intentionally do NOT navigate this tab, so the session
      // is not lost.
      window.open(linkObj.url, '_blank');
    } catch (e) {
      console.error('handleLinkOpen: failed to parse or open link payload', e, intent.payload.link);
    }
  };

  const handlePromptInjection = async (intent: Intent) => {
    if (!intent.payload.prompt) return;
    
    const { text, target_app } = intent.payload.prompt;
    
    // Try to open in code editor (Cursor/VS Code)
    if (target_app === 'editor') {
      // Copy to clipboard first (most reliable)
      try {
        await navigator.clipboard.writeText(text);
        console.log('✅ Prompt copied to clipboard');
      } catch (err) {
        console.error('Failed to copy to clipboard:', err);
      }
      
      // Try multiple protocols to open Cursor/VS Code
      const protocols = [
        'cursor://',  // Cursor protocol
        'vscode://',  // VS Code protocol
      ];
      
      let opened = false;
      for (const protocol of protocols) {
        try {
          // Try to open with protocol handler
          const url = `${protocol}file/${encodeURIComponent(text)}`;
          window.location.href = url;
          
          // Give it a moment to see if it opens
          await new Promise(resolve => setTimeout(resolve, 500));
          opened = true;
          break;
        } catch (err) {
          console.log(`Failed to open with ${protocol}:`, err);
        }
      }
      
      // Show notification that prompt is ready
      if (opened) {
        alert(`Prompt sent to Cursor!\n\n"${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"\n\nIt's also copied to your clipboard.`);
      } else {
        alert(`Prompt copied to clipboard!\n\n"${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"\n\nPaste it into Cursor/VS Code (Cmd/Ctrl+V).`);
      }
    } else {
      // Default: open in browser search or new tab
      const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(text)}`;
      window.open(searchUrl, '_blank');
    }
  };

  const handleClipboardSync = async (intent: Intent) => {
    const rawClipboard = intent.payload.clipboard as any;
    if (!rawClipboard) {
      console.warn('handleClipboardSync: missing clipboard payload', intent);
      return;
    }

    try {
      // Android may send clipboard payload as a JSON string; web sends it as an object.
      const clipboardObj =
        typeof rawClipboard === 'string'
          ? JSON.parse(rawClipboard)
          : rawClipboard;

      const text = clipboardObj.text;
      if (typeof text !== 'string' || !text.length) {
        console.warn('handleClipboardSync: clipboard payload missing text', rawClipboard);
        return;
      }

      // Copy to clipboard with best-effort fallbacks.
      // Modern browsers may require a user gesture for the async
      // Clipboard API, so this can fail when triggered from a
      // WebSocket event. If it does, fall back to the older
      // execCommand("copy") path so we still give the user a chance
      // to get the text into their clipboard.
      try {
        await navigator.clipboard.writeText(text);
        console.log('Clipboard synced from intent via navigator.clipboard');
      } catch (err) {
        console.warn('navigator.clipboard.writeText failed, trying execCommand fallback', err);
        try {
          const textarea = document.createElement('textarea');
          textarea.value = text;
          textarea.style.position = 'fixed';
          textarea.style.opacity = '0';
          document.body.appendChild(textarea);
          textarea.select();
          const succeeded = document.execCommand('copy');
          document.body.removeChild(textarea);
          console.log('Clipboard sync via execCommand result:', succeeded);
        } catch (fallbackErr) {
          console.error('Failed to sync clipboard via any method:', fallbackErr);
        }
      }
    } catch (e) {
      console.error('handleClipboardSync: failed to parse clipboard payload', e, intent.payload.clipboard);
    }
  };

  const handleRemoteAccessRequest = async (intent: Intent, viewerDeviceId: string) => {
    if (!intent.payload.request) return;
    
    const { action } = intent.payload.request;
    
    if (action === 'start_screen_share') {
      try {
        // Import RemoteDesktopManager dynamically
        const RemoteDesktopManager = (await import('../services/RemoteDesktopManager')).default;
        
        // Get viewer device ID from intent payload
        const actualViewerDeviceId = intent.payload.request.viewerDeviceId || viewerDeviceId;
        
        // Create manager as source device
        const manager = new RemoteDesktopManager(
          wsRef.current!,
          session.id,
          deviceId, // source device (this device)
          actualViewerDeviceId, // viewer device (requesting device)
          true // isSource = true (we're sharing our screen)
        );
        
        // Start screen sharing
        await manager.startScreenShare();
        console.log('Screen sharing started');
      } catch (err) {
        console.error('Failed to start screen sharing:', err);
        alert('Failed to start screen sharing: ' + (err instanceof Error ? err.message : 'Unknown error'));
      }
    }
  };

  const handleIntentSent = (intent: Intent) => {
    console.log('Intent sent:', intent);
    // Could show toast notification
  };

  const handleDragStart = (e: React.DragEvent, item: any) => {
    setDraggedItem(item);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragEnd = () => {
    setDraggedItem(null);
  };

  const handleLeaveSession = () => {
    // Don't close the App-level WebSocket, just leave the session
    const appWs = (window as any).appWebSocket;
    if (appWs && appWs.readyState === WebSocket.OPEN) {
      appWs.send(JSON.stringify({
        type: 'session_leave',
        sessionId: session.id,
        deviceId,
        timestamp: Date.now(),
      }));
    }
    
    // Cleanup
    webrtcManagerRef.current?.cleanup();
    // Clear session
    onLeaveSession();
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation(); // Stop event from bubbling to device tiles
    const deviceArray = Array.from(devices.values()).filter(d => d.id !== deviceId);
    // If dropped on empty area, show message
    if (deviceArray.length === 0) {
      alert('No devices connected. Wait for a device to join first.');
      return;
    }
    // Otherwise, let DeviceTile handle it (don't prevent default here)
  };

  const handleGroupDrop = async (groupId: string, intent: Intent) => {
    if (!intentRouterRef.current) {
      alert('Intent router not ready. Please refresh the page.');
      return;
    }

    const group = groups.find(g => g.id === groupId);
    if (!group) {
      alert('Group not found');
      return;
    }

    console.log(`Broadcasting ${intent.intent_type} to group "${group.name}"`);

    // Broadcast to group
    groupService.broadcastToGroup(groupId, intent);
    
    const intentTypeNames: Record<string, string> = {
      'file_handoff': 'File',
      'batch_file_handoff': 'Files',
      'media_continuation': 'Media',
      'link_open': 'Link',
      'prompt_injection': 'Prompt',
      'clipboard_sync': 'Text'
    };
    const typeName = intentTypeNames[intent.intent_type] || 'Item';
    console.log(`✅ ${typeName} broadcast to group "${group.name}" (${group.deviceIds.length} devices)`);
  };

  const deviceArray = Array.from(devices.values()).filter(d => d.id !== deviceId);

  return (
    <div className="device-tiles-container">
      <div className="device-tiles-header">
        <h2>Connected Devices</h2>
        <div className="session-info">
          <span>Session: {session.code}</span>
          <button className="btn-invite" onClick={() => setShowInvitationPanel(true)}>
            Invite Others
          </button>
          <button className="btn-leave" onClick={handleLeaveSession}>
            Leave Session
          </button>
        </div>
      </div>

      {/* Show QR code for session creator */}
      {session.createdBy === deviceId && (
        <div className="qr-code-section">
          <p className="qr-label">Share this QR code to connect devices:</p>
          <div className="qr-container-small">
            <QRCodeSVG value={session.code} size={150} />
          </div>
          <p className="session-code-display-small">
            Code: <strong>{session.code}</strong>
          </p>
        </div>
      )}

      {/* Group Manager */}
      {deviceArray.length > 0 && (
        <GroupManager
          devices={deviceArray}
          groups={groups}
          currentDeviceId={deviceId}
          onCreateGroup={(name, deviceIds, color) => {
            groupService.createGroup(name, deviceIds, color);
          }}
          onUpdateGroup={(groupId, updates) => {
            groupService.updateGroupDetails(groupId, updates);
          }}
          onDeleteGroup={(groupId) => {
            groupService.deleteGroup(groupId);
          }}
        />
      )}

      <div className="drag-drop-zone">
        <p className="drag-instructions">
          Drag files, links, or text here, then drop onto a device tile
        </p>
        <div 
          className="drop-area"
          onDragOver={(e) => {
            // Only prevent default if not over a device tile
            const target = e.target as HTMLElement;
            if (!target.closest('.device-tile')) {
              e.preventDefault();
            }
          }}
          onDrop={(e) => {
            // Only handle drop if not on a device tile
            const target = e.target as HTMLElement;
            if (!target.closest('.device-tile')) {
              handleDrop(e);
            }
          }}
        >
          {deviceArray.length === 0 ? (
            <div className="no-devices">
              <p>Waiting for other devices to join...</p>
              <p className="session-code-hint">Share code: <strong>{session.code}</strong></p>
            </div>
          ) : (
            <div className="device-tiles-grid">
              {/* Group Tiles */}
              {groups.map((group) => (
                <GroupTile
                  key={group.id}
                  group={group}
                  devices={deviceArray}
                  onDrop={handleGroupDrop}
                />
              ))}
              
              {/* Device Tiles */}
              {deviceArray.map((device) => (
                <DeviceTile
                  key={device.id}
                  device={device}
                  draggedItem={draggedItem}
                  onDragStart={handleDragStart}
                  onDragEnd={handleDragEnd}
                  onDrop={async (intent) => {
                    console.log('=== DeviceTiles onDrop Handler ===');
                    console.log('Intent received:', intent.intent_type);
                    console.log('Target device:', device.id, device.name);
                    
                    if (!intentRouterRef.current) {
                      console.error('❌ IntentRouter not initialized');
                      alert('Intent router not ready. Please refresh the page.');
                      return;
                    }
                    
                    try {
                      // Grant permission on TARGET device when sending intent
                      // This shows that we're sending this type of content to them
                      console.log('Granting permission for intent type:', intent.intent_type, 'on target device:', device.id);
                      grantPermissionForIntent(intent, device.id); // Grant permission on TARGET device
                      
                      console.log('Routing intent to device:', device.id);
                      await intentRouterRef.current.routeIntent(intent, device.id);
                      console.log('✅ Intent routed successfully');
                      
                      // Show success feedback
                      const intentTypeNames: Record<string, string> = {
                        'file_handoff': 'File',
                        'batch_file_handoff': 'Files',
                        'media_continuation': 'Media',
                        'link_open': 'Link',
                        'prompt_injection': 'Prompt',
                        'clipboard_sync': 'Clipboard'
                      };
                      const typeName = intentTypeNames[intent.intent_type] || 'Item';
                      console.log(`✅ ${typeName} sent to ${device.name}`);
                    } catch (error) {
                      console.error('❌ Error routing intent:', error);
                      alert('Failed to send: ' + error);
                    }
                  }}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Invitation Panel */}
      <InvitationPanel
        sessionId={session.id}
        sessionCode={session.code}
        invitationService={invitationService}
        isOpen={showInvitationPanel}
        onClose={() => setShowInvitationPanel(false)}
      />
    </div>
  );
}

