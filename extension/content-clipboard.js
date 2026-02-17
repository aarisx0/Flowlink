/**
 * FlowLink - Clipboard Monitoring Content Script
 * Detects copy events and syncs clipboard across devices
 */

console.log('FlowLink clipboard monitoring loaded');

let lastClipboardText = '';
let lastClipboardTime = 0;

// Monitor copy events
document.addEventListener('copy', async (e) => {
  try {
    // Small delay to ensure clipboard is populated
    setTimeout(async () => {
      try {
        // Read from clipboard
        const text = await navigator.clipboard.readText();
        
        // Avoid duplicate sends
        if (text === lastClipboardText && Date.now() - lastClipboardTime < 1000) {
          return;
        }
        
        lastClipboardText = text;
        lastClipboardTime = Date.now();
        
        console.log('Clipboard copied:', text.substring(0, 50));
        
        // Send to background script
        chrome.runtime.sendMessage({
          type: 'clipboard_changed',
          data: {
            text,
            source: 'copy_event'
          }
        });
      } catch (err) {
        console.error('Failed to read clipboard:', err);
      }
    }, 100);
  } catch (err) {
    console.error('Copy event error:', err);
  }
});

// Monitor cut events
document.addEventListener('cut', async (e) => {
  try {
    setTimeout(async () => {
      try {
        const text = await navigator.clipboard.readText();
        
        if (text === lastClipboardText && Date.now() - lastClipboardTime < 1000) {
          return;
        }
        
        lastClipboardText = text;
        lastClipboardTime = Date.now();
        
        console.log('Clipboard cut:', text.substring(0, 50));
        
        chrome.runtime.sendMessage({
          type: 'clipboard_changed',
          data: {
            text,
            source: 'cut_event'
          }
        });
      } catch (err) {
        console.error('Failed to read clipboard:', err);
      }
    }, 100);
  } catch (err) {
    console.error('Cut event error:', err);
  }
});

// Keyboard shortcut monitoring (Ctrl+C, Cmd+C)
document.addEventListener('keydown', async (e) => {
  // Check for Ctrl+C or Cmd+C
  if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
    setTimeout(async () => {
      try {
        const text = await navigator.clipboard.readText();
        
        if (text === lastClipboardText && Date.now() - lastClipboardTime < 1000) {
          return;
        }
        
        lastClipboardText = text;
        lastClipboardTime = Date.now();
        
        console.log('Clipboard (keyboard):', text.substring(0, 50));
        
        chrome.runtime.sendMessage({
          type: 'clipboard_changed',
          data: {
            text,
            source: 'keyboard_shortcut'
          }
        });
      } catch (err) {
        // Silently fail - clipboard might not be accessible
      }
    }, 100);
  }
});

// Periodic clipboard check (fallback for apps that don't trigger events)
let lastCheckedText = '';
setInterval(async () => {
  try {
    const text = await navigator.clipboard.readText();
    
    if (text && text !== lastCheckedText && text !== lastClipboardText) {
      lastCheckedText = text;
      lastClipboardText = text;
      lastClipboardTime = Date.now();
      
      console.log('Clipboard (periodic check):', text.substring(0, 50));
      
      chrome.runtime.sendMessage({
        type: 'clipboard_changed',
        data: {
          text,
          source: 'periodic_check'
        }
      });
    }
  } catch (err) {
    // Silently fail - clipboard might not be accessible
  }
}, 2000); // Check every 2 seconds

console.log('Clipboard monitoring active');
