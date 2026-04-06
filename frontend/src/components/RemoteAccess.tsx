import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import RemoteDesktopManager from '../services/RemoteDesktopManager';
import { generateDeviceId } from '@shared/utils';
import { SIGNALING_WS_URL } from '../config/signaling';
import './RemoteAccess.css';

export default function RemoteAccess() {
  const { deviceId } = useParams<{ deviceId: string }>();
  const navigate = useNavigate();
  const [status, setStatus] = useState<string>('Connecting...');
  const [error, setError] = useState<string | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const remoteDesktopManagerRef = useRef<RemoteDesktopManager | null>(null);
  // Get device ID from session storage or generate new one
  const getOrCreateDeviceId = (): string => {
    const stored = sessionStorage.getItem('deviceId');
    if (stored) return stored;
    const newId = generateDeviceId();
    sessionStorage.setItem('deviceId', newId);
    return newId;
  };
  
  const deviceIdRef = useRef<string>(getOrCreateDeviceId());

  useEffect(() => {
    if (!deviceId) {
      setError('No device ID provided');
      return;
    }

    // Connect to WebSocket and set up remote desktop viewer
    const connect = async () => {
      try {
        setStatus('Connecting to session...');
        
        // Get session info from sessionStorage (set by DeviceTiles)
        const sessionCode = sessionStorage.getItem('sessionCode');
        const sessionId = sessionStorage.getItem('sessionId');
        const storedDeviceId = sessionStorage.getItem('deviceId');
        const username = sessionStorage.getItem('username');
        const deviceName = sessionStorage.getItem('deviceName') || 'Viewer';
        const deviceType = sessionStorage.getItem('deviceType') || 'laptop';
        
        // Use stored deviceId if available (this should be the same deviceId from DeviceTiles)
        if (storedDeviceId) {
          deviceIdRef.current = storedDeviceId;
        }
        
        if (!sessionCode || !sessionId) {
          setError('Not in a session. Please join a session first from the main page.');
          return;
        }
        
        if (!storedDeviceId) {
          setError('Device ID not found. Please return to the main page and join a session first.');
          return;
        }

        if (!username) {
          setError('Username not found. Please return to the main page and rejoin the session.');
          return;
        }
        
        console.log('RemoteAccess: Connecting with sessionCode:', sessionCode, 'sessionId:', sessionId);
        console.log('RemoteAccess: Source device (sharing):', deviceId, 'Viewer device:', deviceIdRef.current);

        // Connect WebSocket with timeout handling
        let connectionTimeout: number;
        const ws = new WebSocket(SIGNALING_WS_URL);
        wsRef.current = ws;

        // Set connection timeout
        connectionTimeout = window.setTimeout(() => {
          if (ws.readyState === WebSocket.CONNECTING) {
            ws.close();
            setError('Connection timeout. Make sure the backend server is running on port 8080.');
          }
        }, 10000); // 10 second timeout

        ws.onopen = () => {
          clearTimeout(connectionTimeout);
          setStatus('Requesting screen share...');
          
          // Join session
          try {
            // Join session with the same deviceId as DeviceTiles (stored in sessionStorage)
            // This ensures we're recognized as the same device, not a new one
            ws.send(JSON.stringify({
                type: 'session_join',
                payload: {
                  code: sessionCode,
                  deviceId: deviceIdRef.current, // Same deviceId as DeviceTiles
                  deviceName,
                  deviceType,
                  username,
                },
                timestamp: Date.now(),
              }));
            
            console.log('RemoteAccess: Sent session_join with deviceId:', deviceIdRef.current);

            // Set up RemoteDesktopManager as viewer
            const manager = new RemoteDesktopManager(
              ws,
              sessionId,
              deviceId, // source device (the one sharing screen)
              deviceIdRef.current, // viewer device (this device)
              false // isSource = false (we're the viewer)
            );
            
            remoteDesktopManagerRef.current = manager;

            // Set up remote stream handler
            manager.setOnRemoteStream((stream) => {
              setRemoteStream(stream);
              setStatus('Connected');
              if (videoRef.current) {
                videoRef.current.srcObject = stream;
              }
            });

            manager.setOnConnectionStateChange((state) => {
              if (state === 'connected') {
                setStatus('Connected');
              } else if (state === 'disconnected' || state === 'failed') {
                setError('Connection lost');
              }
            });

            // Connect as viewer (will wait for offer from source)
            manager.connectAsViewer();
          } catch (err) {
            console.error('Error setting up remote access:', err);
            setError('Failed to set up remote access: ' + (err instanceof Error ? err.message : 'Unknown error'));
          }
        };

        ws.onerror = (err) => {
          console.error('WebSocket error:', err);
          setError('Failed to connect to server. Make sure the backend is running on port 8080.');
        };

        ws.onclose = (event) => {
          clearTimeout(connectionTimeout);
          if (event.code !== 1000) {
            // Code 1006 = abnormal closure (connection lost without close frame)
            // Code 1001 = going away (server closed connection)
            let errorMsg = `Connection closed (code: ${event.code}). `;
            if (event.code === 1006) {
              errorMsg += 'The server may not be running or the connection was lost. Make sure the backend is running on port 8080.';
            } else if (event.code === 1001) {
              errorMsg += 'Server closed the connection.';
            } else {
              errorMsg += 'Make sure the backend is running on port 8080.';
            }
            setError(errorMsg);
          } else {
            setStatus('Disconnected');
          }
        };

        ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);
            console.log('RemoteAccess received message:', message.type);
            
            // Handle session_joined to confirm connection
            if (message.type === 'session_joined') {
              console.log('Successfully joined session for remote access');
              setStatus('Connected to session. Waiting for screen share...');
            }
            
            // Handle errors
            if (message.type === 'error') {
              setError(message.payload?.message || 'Server error');
              ws.close();
              return;
            }
            
            // Handle WebRTC signaling messages
            if (message.type && message.type.startsWith('webrtc_')) {
              // RemoteDesktopManager will handle these
              console.log('Received WebRTC message:', message.type);
            }
          } catch (e) {
            console.error('Error parsing message:', e);
            // Not a JSON message, ignore
          }
        };

      } catch (err) {
        console.error('Failed to connect:', err);
        setError('Failed to start remote access: ' + (err instanceof Error ? err.message : 'Unknown error'));
      }
    };

    connect();

    return () => {
      // Cleanup
      if (remoteDesktopManagerRef.current) {
        remoteDesktopManagerRef.current.cleanup();
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (remoteStream) {
        remoteStream.getTracks().forEach(track => track.stop());
      }
    };
  }, [deviceId]);

  return (
    <div className="remote-access-container">
      <div className="remote-access-header">
        <button className="back-button" onClick={() => navigate(-1)}>
          ← Back
        </button>
        <h2>Remote Access</h2>
      </div>

      <div className="remote-access-content">
        {error ? (
          <div className="remote-access-error">
            <h3>Remote Access Error</h3>
            <p>{error}</p>
            <button className="back-button" onClick={() => navigate(-1)}>
              Go Back
            </button>
          </div>
        ) : remoteStream ? (
          <div className="remote-access-viewer">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              style={{
                width: '100%',
                height: 'auto',
                maxHeight: '80vh',
                backgroundColor: '#000',
              }}
            />
            <div className="remote-access-controls">
              <p>{status}</p>
              <button onClick={() => navigate(-1)}>Close</button>
            </div>
          </div>
        ) : (
          <div className="remote-access-loading">
            <div className="spinner"></div>
            <p>{status}</p>
            <p className="hint">Waiting for source device to start screen sharing...</p>
          </div>
        )}
      </div>
    </div>
  );
}
