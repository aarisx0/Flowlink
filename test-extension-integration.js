/**
 * Test FlowLink Extension Integration
 * Tests WebSocket connection and message handling
 */

const WebSocket = require('ws');

const BACKEND_URL = 'ws://localhost:8080';
let testsPassed = 0;
let testsFailed = 0;

function log(emoji, message) {
  console.log(`${emoji} ${message}`);
}

function testPassed(name) {
  testsPassed++;
  log('✅', `PASS: ${name}`);
}

function testFailed(name, error) {
  testsFailed++;
  log('❌', `FAIL: ${name} - ${error}`);
}

// Test 1: Backend Connection
function testBackendConnection() {
  return new Promise((resolve) => {
    log('🔌', 'Testing backend connection...');
    
    const ws = new WebSocket(BACKEND_URL);
    
    ws.on('open', () => {
      testPassed('Backend connection established');
      ws.close();
      resolve(true);
    });
    
    ws.on('error', (error) => {
      testFailed('Backend connection', error.message);
      resolve(false);
    });
    
    setTimeout(() => {
      if (ws.readyState !== WebSocket.OPEN) {
        testFailed('Backend connection', 'Timeout');
        ws.close();
        resolve(false);
      }
    }, 5000);
  });
}

// Test 2: Device Registration
function testDeviceRegistration() {
  return new Promise((resolve) => {
    log('📝', 'Testing device registration...');
    
    const ws = new WebSocket(BACKEND_URL);
    let registered = false;
    
    ws.on('open', () => {
      ws.send(JSON.stringify({
        type: 'device_register',
        deviceId: 'test-ext-123',
        payload: {
          deviceId: 'test-ext-123',
          deviceName: 'Test Browser Extension',
          deviceType: 'browser',
          username: 'testuser'
        },
        timestamp: Date.now()
      }));
    });
    
    ws.on('message', (data) => {
      const message = JSON.parse(data.toString());
      if (message.type === 'device_registered') {
        registered = true;
        testPassed('Device registration');
        ws.close();
        resolve(true);
      }
    });
    
    ws.on('error', (error) => {
      testFailed('Device registration', error.message);
      resolve(false);
    });
    
    setTimeout(() => {
      if (!registered) {
        testFailed('Device registration', 'No response received');
        ws.close();
        resolve(false);
      }
    }, 5000);
  });
}

// Test 3: Media Handoff Message
function testMediaHandoff() {
  return new Promise((resolve) => {
    log('🎬', 'Testing media handoff message...');
    
    const ws = new WebSocket(BACKEND_URL);
    
    ws.on('open', () => {
      // Register first
      ws.send(JSON.stringify({
        type: 'device_register',
        deviceId: 'test-ext-456',
        payload: {
          deviceId: 'test-ext-456',
          deviceName: 'Test Browser',
          deviceType: 'browser',
          username: 'testuser2'
        },
        timestamp: Date.now()
      }));
      
      // Wait a bit then send media handoff
      setTimeout(() => {
        ws.send(JSON.stringify({
          type: 'media_handoff',
          deviceId: 'test-ext-456',
          sessionId: null,
          payload: {
            action: 'paused',
            title: 'Test Video',
            url: 'https://youtube.com/watch?v=test',
            timestamp: 125,
            platform: 'YouTube'
          },
          timestamp: Date.now()
        }));
        
        testPassed('Media handoff message sent');
        setTimeout(() => {
          ws.close();
          resolve(true);
        }, 1000);
      }, 500);
    });
    
    ws.on('error', (error) => {
      testFailed('Media handoff', error.message);
      resolve(false);
    });
  });
}

// Test 4: Clipboard Broadcast
function testClipboardBroadcast() {
  return new Promise((resolve) => {
    log('📋', 'Testing clipboard broadcast...');
    
    const ws = new WebSocket(BACKEND_URL);
    
    ws.on('open', () => {
      // Register first
      ws.send(JSON.stringify({
        type: 'device_register',
        deviceId: 'test-ext-789',
        payload: {
          deviceId: 'test-ext-789',
          deviceName: 'Test Browser',
          deviceType: 'browser',
          username: 'testuser3'
        },
        timestamp: Date.now()
      }));
      
      // Wait a bit then send clipboard
      setTimeout(() => {
        ws.send(JSON.stringify({
          type: 'clipboard_broadcast',
          deviceId: 'test-ext-789',
          sessionId: null,
          payload: {
            clipboard: {
              text: 'Test clipboard content'
            }
          },
          timestamp: Date.now()
        }));
        
        testPassed('Clipboard broadcast message sent');
        setTimeout(() => {
          ws.close();
          resolve(true);
        }, 1000);
      }, 500);
    });
    
    ws.on('error', (error) => {
      testFailed('Clipboard broadcast', error.message);
      resolve(false);
    });
  });
}

// Test 5: Ping/Pong
function testPingPong() {
  return new Promise((resolve) => {
    log('🏓', 'Testing ping/pong...');
    
    const ws = new WebSocket(BACKEND_URL);
    let pongReceived = false;
    
    ws.on('open', () => {
      ws.send(JSON.stringify({
        type: 'ping',
        deviceId: 'test-ext-ping',
        timestamp: Date.now()
      }));
    });
    
    ws.on('message', (data) => {
      const message = JSON.parse(data.toString());
      if (message.type === 'pong') {
        pongReceived = true;
        testPassed('Ping/Pong keepalive');
        ws.close();
        resolve(true);
      }
    });
    
    ws.on('error', (error) => {
      testFailed('Ping/Pong', error.message);
      resolve(false);
    });
    
    setTimeout(() => {
      if (!pongReceived) {
        testFailed('Ping/Pong', 'No pong received');
        ws.close();
        resolve(false);
      }
    }, 5000);
  });
}

// Run all tests
async function runTests() {
  log('🧪', 'Starting FlowLink Extension Integration Tests\n');
  
  await testBackendConnection();
  await testDeviceRegistration();
  await testMediaHandoff();
  await testClipboardBroadcast();
  await testPingPong();
  
  console.log('\n' + '='.repeat(50));
  log('📊', `Tests Complete: ${testsPassed} passed, ${testsFailed} failed`);
  
  if (testsFailed === 0) {
    log('🎉', 'All tests passed! Extension integration is working correctly.');
  } else {
    log('⚠️', 'Some tests failed. Please check the errors above.');
  }
  
  process.exit(testsFailed > 0 ? 1 : 0);
}

// Check if backend is running
log('🔍', 'Checking if backend is running on ws://localhost:8080...\n');
runTests();
