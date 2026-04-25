import { useState, useEffect, useRef } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import SessionManager from './components/SessionManager';
import DeviceTiles from './components/DeviceTiles';
import RemoteAccess from './components/RemoteAccess';
import DownloadPage from './components/DownloadPage';
import UsernameModal from './components/UsernameModal';
import { Session } from '@shared/types';
import { generateDeviceId } from '@shared/utils';
import InvitationService from './services/InvitationService';
import { SIGNALING_WS_URL } from './config/signaling';
import './App.css';

function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [deviceId] = useState(() => generateDeviceId());
  const [deviceName] = useState(() => {
    // Try to get device name from browser
    return (navigator as any).userAgentData?.platform || 'Laptop';
  });
  const [username, setUsername] = useState<string | null>(() => {
    return localStorage.getItem('flowlink_username');
  });
  const [invitationService, setInvitationService] = useState<InvitationService | null>(null);
  const invitationServiceRef = useRef<InvitationService | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  // Connect to WebSocket for persistent invitation listening
  const connectWebSocket = () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return wsRef.current;
    }

    const ws = new WebSocket(SIGNALING_WS_URL);
    
    ws.onopen = () => {
      console.log('App-level WebSocket connected for invitations');
      
      // Register device for invitation listening
      ws.send(JSON.stringify({
        type: 'device_register',
        payload: {
          deviceId,
          deviceName,
          deviceType: 'laptop',
          username,
        },
        timestamp: Date.now(),
      }));
      
      // Store WebSocket reference for components to access
      wsRef.current = ws;
      
      // Make WebSocket globally accessible for components
      (window as any).appWebSocket = ws;
      
      // Set WebSocket for invitation service when it's ready
      if (invitationServiceRef.current) {
        invitationServiceRef.current.setWebSocket(ws);
        console.log('WebSocket set on InvitationService');
      } else {
        console.warn('InvitationService not ready when WebSocket connected');
      }
    };
    
    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      handleWebSocketMessage(message);
    };
    
    ws.onclose = () => {
      console.log('App-level WebSocket disconnected');
      wsRef.current = null;
      (window as any).appWebSocket = null;
      // Reconnect after a delay
      setTimeout(connectWebSocket, 2000);
    };
    
    ws.onerror = (error) => {
      console.error('App-level WebSocket error:', error);
    };
    
    wsRef.current = ws;
    return ws;
  };

  // Handle WebSocket messages at App level
  const handleWebSocketMessage = (message: any) => {
    switch (message.type) {
      case 'device_registered':
        console.log('Device registered for invitation listening:', message.payload);
        break;
        
      case 'session_created':
      case 'session_joined':
        // Forward session messages to SessionManager via custom event
        const sessionEvent = new CustomEvent('sessionMessage', {
          detail: { message }
        });
        window.dispatchEvent(sessionEvent);
        break;
      case 'chat_message':
      case 'chat_delivered':
      case 'chat_seen':
      case 'chat_typing': {
        const chatEvent = new CustomEvent('chatMessage', {
          detail: { message }
        });
        window.dispatchEvent(chatEvent);
        break;
      }
        
      case 'session_invitation':
        // Handle incoming session invitation
        console.log('📨 App.tsx received session_invitation:', message);
        const invitation = message.payload.invitation;
        console.log('  Invitation data:', invitation);
        console.log('  InvitationService available:', !!invitationServiceRef.current);
        
        if (invitationServiceRef.current) {
          console.log('  Calling handleIncomingInvitation...');
          invitationServiceRef.current.handleIncomingInvitation(invitation);
          // Store invitation data for potential acceptance
          invitationServiceRef.current.storeInvitationData(invitation.sessionId, invitation.sessionCode);
          console.log('  Invitation handled successfully');
        } else {
          console.error('  InvitationService not available!');
        }
        break;

      case 'nearby_session_broadcast':
        // Handle nearby session notification
        console.log('📨 App.tsx received nearby_session_broadcast:', message);
        const nearbySession = message.payload.nearbySession;
        console.log('  Nearby session data:', nearbySession);
        console.log('  InvitationService available:', !!invitationServiceRef.current);
        
        if (invitationServiceRef.current) {
          console.log('  Calling handleNearbySession...');
          invitationServiceRef.current.handleNearbySession(nearbySession);
          // Store session data for potential joining
          invitationServiceRef.current.storeInvitationData(nearbySession.sessionId, nearbySession.sessionCode);
          console.log('  Nearby session handled successfully');
        } else {
          console.error('  InvitationService not available!');
        }
        break;

      case 'invitation_response':
        // Handle invitation response (accepted/rejected)
        const response = message.payload;
        if (invitationServiceRef.current) {
          if (response.accepted) {
            invitationServiceRef.current.notificationService.showToast({
              type: 'success',
              title: 'Invitation Accepted',
              message: `${response.inviteeUsername} accepted your invitation`,
              duration: 4000,
            });
          } else {
            invitationServiceRef.current.notificationService.showToast({
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
        if (invitationServiceRef.current) {
          invitationServiceRef.current.notificationService.showToast({
            type: 'success',
            title: 'Invitation Sent',
            message: `Invitation sent to ${sentResponse.targetUsername || sentResponse.targetIdentifier}`,
            duration: 3000,
          });
        }
        break;

      case 'device_connected':
        // Handle device connected notification (from extension or other devices)
        console.log('📱 Device connected notification:', message.payload);
        const connectedDevice = message.payload;
        if (invitationServiceRef.current && connectedDevice.deviceName) {
          invitationServiceRef.current.notificationService.showToast({
            type: 'info',
            title: 'Device Connected',
            message: `${connectedDevice.deviceName} is now online`,
            duration: 3000,
          });
        }
        break;

      case 'media_handoff_offer':
        // Handle media handoff from extension or other devices
        console.log('🎬 Media handoff offer:', message.payload);
        const mediaOffer = message.payload;
        if (invitationServiceRef.current && mediaOffer.title && mediaOffer.url) {
          const timestamp = mediaOffer.timestamp || 0;
          const timestampText = timestamp > 0 ? ` at ${Math.floor(timestamp / 60)}:${(timestamp % 60).toString().padStart(2, '0')}` : '';
          
          let finalUrl = mediaOffer.url;
          // Add timestamp for YouTube videos
          if (timestamp > 0 && mediaOffer.url.includes('youtube.com')) {
            finalUrl += `${mediaOffer.url.includes('?') ? '&' : '?'}t=${Math.floor(timestamp)}`;
          }
          
          invitationServiceRef.current.notificationService.showToast({
            type: 'info',
            title: `Continue watching on ${mediaOffer.platform || 'this device'}?`,
            message: `${mediaOffer.title}${timestampText}`,
            duration: 10000,
            actions: [
              { id: 'open', label: 'Open', action: 'accept' as const },
              { id: 'dismiss', label: 'Dismiss', action: 'dismiss' as const }
            ],
            onAction: (actionId: string) => {
              if (actionId === 'open') {
                window.open(finalUrl, '_blank');
              }
            }
          });
        }
        break;

      case 'clipboard_sync':
        // Handle clipboard sync from extension or other devices
        console.log('📋 Clipboard sync:', message.payload);
        const clipboardData = message.payload.clipboard;
        const clipboardText = clipboardData?.text || clipboardData?.url;
        if (clipboardText) {
          // Copy to clipboard
          navigator.clipboard.writeText(clipboardText).then(() => {
            console.log('Clipboard synced:', clipboardText.substring(0, 50));
            if (invitationServiceRef.current) {
              invitationServiceRef.current.notificationService.showToast({
                type: 'success',
                title: 'Clipboard Synced',
                message: clipboardText.substring(0, 100) + (clipboardText.length > 100 ? '...' : ''),
                duration: 3000,
              });
            }
          }).catch(err => {
            console.error('Failed to write to clipboard:', err);
          });
        }
        break;
    }
  };

  // Join session programmatically
  const joinSessionWithCode = (sessionCode: string) => {
    console.log('App-level joining session:', sessionCode);
    
    // Clear current session first
    setSession(null);
    
    // Dispatch event to SessionManager to handle the join
    const joinEvent = new CustomEvent('joinSessionFromInvitation', {
      detail: { sessionCode }
    });
    window.dispatchEvent(joinEvent);
  };

  // Initialize invitation service and connect WebSocket when username is available
  useEffect(() => {
    if (!username) return;

    // Create InvitationService first if it doesn't exist
    if (!invitationServiceRef.current) {
      console.log('Creating InvitationService for user:', username);
      const service = new InvitationService(
        deviceId,
        username,
        deviceName,
        (sessionCode) => {
          // Handle invitation acceptance by programmatically joining the session
          console.log('Invitation accepted, joining session:', sessionCode);
          joinSessionWithCode(sessionCode);
        }
      );
      
      // Set both ref and state
      invitationServiceRef.current = service;
      setInvitationService(service);
      console.log('InvitationService created and stored in ref');
    }

    // Connect WebSocket after InvitationService is ready
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      console.log('Connecting WebSocket with InvitationService ready');
      connectWebSocket();
    }

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [username, deviceId, deviceName]);

  // Update InvitationService WebSocket when it changes
  useEffect(() => {
    if (invitationServiceRef.current && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      invitationServiceRef.current.setWebSocket(wsRef.current);
      console.log('WebSocket updated on existing InvitationService');
    }
  }, [invitationService, wsRef.current]);

  const handleUsernameSubmit = (newUsername: string) => {
    setUsername(newUsername);
  };

  return (
    <BrowserRouter>
      <div className="app">
        <UsernameModal
          isOpen={!username}
          onSubmit={handleUsernameSubmit}
          deviceName={deviceName}
        />

        <header className="app-header">
          <h1>FlowLink</h1>
          <p>Cross-Device Continuity</p>
          {username && (
            <div className="user-info">
              <span>Welcome, {username}</span>
              {!session && <span className="session-lock-badge">🔒 No active session</span>}
              {session && <span className="session-active-badge">🟢 Session {session.code}</span>}
            </div>
          )}
        </header>

        <main className="app-main">
          <Routes>
            <Route
              path="/download"
              element={<DownloadPage />}
            />
            <Route
              path="/remote/:deviceId"
              element={<RemoteAccess />}
            />
            <Route
              path="/"
              element={
                !session ? (
                  <SessionManager
                    deviceId={deviceId}
                    deviceName={deviceName}
                    deviceType="laptop"
                    username={username || ''}
                    invitationService={invitationService}
                    onSessionCreated={setSession}
                    onSessionJoined={setSession}
                  />
                ) : (
                  <DeviceTiles
                    session={session}
                    deviceId={deviceId}
                    deviceName={deviceName}
                    deviceType="laptop"
                    username={username || ''}
                    invitationService={invitationService}
                    onLeaveSession={() => setSession(null)}
                  />
                )
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

export default App;

