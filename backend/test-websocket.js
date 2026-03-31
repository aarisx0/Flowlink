#!/usr/bin/env node
/**
 * WebSocket Connection Test
 * Tests basic connectivity to the backend server
 */

import WebSocket from 'ws';
import http from 'http';

function testWebSocketConnection() {
  const wsUrl = 'ws://localhost:8080';
  console.log(`🧪 Testing WebSocket connection to ${wsUrl}...`);
  
  const ws = new WebSocket(wsUrl);
  let testsPassed = 0;
  let testsFailed = 0;
  
  const timeout = setTimeout(() => {
    console.error('❌ Connection timeout - server not responding');
    process.exit(1);
  }, 5000);

  ws.onopen = () => {
    clearTimeout(timeout);
    console.log('✅ WebSocket connection established');
    testsPassed++;
    
    // Test 1: Device registration
    console.log('\n📝 Test 1: Device registration...');
    ws.send(JSON.stringify({
      type: 'device_register',
      payload: {
        deviceId: 'test-device-001',
        deviceName: 'Test Device',
        deviceType: 'laptop',
        username: 'testuser',
      },
      timestamp: Date.now(),
    }));
  };

  ws.onmessage = (event) => {
    try {
      const message = JSON.parse(event.data);
      console.log(`📨 Received message:`, message.type);
      
      if (message.type === 'device_registered') {
        console.log('✅ Device registration successful');
        testsPassed++;
        
        // Test 2: Health check
        console.log('\n🏥 Test 2: Health check via HTTP...');
        http.get('http://localhost:8080/health', (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => {
            try {
              const health = JSON.parse(data);
              console.log('✅ Health check passed:', health);
              testsPassed++;
              
              // All tests passed
              ws.close();
            } catch (e) {
              console.error('❌ Failed to parse health check:', e.message);
              testsFailed++;
              ws.close();
            }
          });
        }).on('error', (err) => {
          console.error('❌ Health check failed:', err.message);
          testsFailed++;
          ws.close();
        });
      }
    } catch (e) {
      console.error('❌ Failed to parse message:', e.message);
      testsFailed++;
      ws.close();
    }
  };

  ws.onerror = (error) => {
    clearTimeout(timeout);
    console.error('❌ WebSocket connection error:', error.message);
    testsFailed++;
    process.exit(1);
  };

  ws.onclose = () => {
    console.log('\n' + '='.repeat(50));
    console.log(`Tests passed: ${testsPassed}/3`);
    console.log(`Tests failed: ${testsFailed}/3`);
    console.log('='.repeat(50));
    
    if (testsFailed > 0) {
      process.exit(1);
    } else {
      console.log('✅ All tests passed!');
      process.exit(0);
    }
  };
}

testWebSocketConnection();
