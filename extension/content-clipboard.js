/**
 * FlowLink - Clipboard Monitoring Content Script
 * Detects copy events and syncs clipboard across devices
 */

if (window.__flowlinkClipboardMonitorLoaded) {
  console.log('FlowLink clipboard monitoring already active');
} else {
  window.__flowlinkClipboardMonitorLoaded = true;

console.log('FlowLink clipboard monitoring loaded');

let lastClipboardFingerprint = '';
let lastClipboardTime = 0;
let isExtensionValid = true;
const DUPLICATE_WINDOW_MS = 2500;
let clipboardPollTimer = null;
let clipboardPollEnabled = false;

// Check if extension context is valid
function checkExtensionContext() {
  try {
    chrome.runtime.id;
    return true;
  } catch (err) {
    if (!isExtensionValid) return false; // Already logged
    isExtensionValid = false;
    return false;
  }
}

// Safe message sending
function sendToBackground(message) {
  if (!checkExtensionContext()) return;
  
  try {
    chrome.runtime.sendMessage(message, () => {
      if (chrome.runtime.lastError) {
        const errorMessage = chrome.runtime.lastError.message || '';
        if (
          errorMessage.includes('context invalidated') ||
          errorMessage.includes('Receiving end does not exist') ||
          errorMessage.includes('Could not establish connection')
        ) {
          isExtensionValid = false;
        }
      }
    });
  } catch (err) {
    if (
      err.message.includes('context invalidated') ||
      err.message.includes('Receiving end does not exist') ||
      err.message.includes('Could not establish connection')
    ) {
      isExtensionValid = false;
    }
  }
}

function getSelectionText() {
  const selection = window.getSelection();
  return selection ? selection.toString().trim() : '';
}

function isUrl(value) {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch (_err) {
    return false;
  }
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function readClipboardSnapshot() {
  const snapshot = {
    text: '',
    html: '',
    url: '',
    image: '',
    mimeType: ''
  };

  try {
    if (navigator.clipboard.read) {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        if (!snapshot.text && item.types.includes('text/plain')) {
          const blob = await item.getType('text/plain');
          snapshot.text = (await blob.text()).trim();
        }

        if (!snapshot.html && item.types.includes('text/html')) {
          const blob = await item.getType('text/html');
          snapshot.html = await blob.text();
        }

        const imageType = item.types.find((type) => type.startsWith('image/'));
        if (!snapshot.image && imageType) {
          const blob = await item.getType(imageType);
          snapshot.image = await blobToDataUrl(blob);
          snapshot.mimeType = imageType;
        }
      }
    }

    if (!snapshot.text && navigator.clipboard.readText) {
      snapshot.text = (await navigator.clipboard.readText()).trim();
    }
  } catch (_err) {
    // Clipboard reads can fail when the document is not focused.
  }

  if (!snapshot.url && isUrl(snapshot.text)) {
    snapshot.url = snapshot.text;
  }

  return snapshot;
}

async function buildClipboardPayload(source, clipboardData) {
  const payload = {
    text: clipboardData?.getData('text/plain')?.trim() || '',
    html: clipboardData?.getData('text/html') || '',
    url: clipboardData?.getData('text/uri-list')?.trim() || '',
    image: '',
    mimeType: '',
    source,
    sourceUrl: window.location.href,
    pageTitle: document.title
  };

  if (!payload.text && clipboardData) {
    payload.text = getSelectionText();
  }

  if (clipboardData?.items) {
    for (const item of clipboardData.items) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          payload.image = await blobToDataUrl(file);
          payload.mimeType = item.type;
          break;
        }
      }
    }
  }

  if (!clipboardData) {
    const snapshot = await readClipboardSnapshot();
    payload.text = payload.text || snapshot.text;
    payload.html = payload.html || snapshot.html;
    payload.url = payload.url || snapshot.url;
    payload.image = payload.image || snapshot.image;
    payload.mimeType = payload.mimeType || snapshot.mimeType;
  }

  if (!payload.url && isUrl(payload.text)) {
    payload.url = payload.text;
  }

  return payload;
}

function fingerprintClipboard(payload) {
  return JSON.stringify([
    payload.text || '',
    payload.url || '',
    payload.html || '',
    payload.image ? payload.image.slice(0, 96) : '',
    payload.mimeType || ''
  ]);
}

function sendClipboardPayload(payload) {
  const hasData = payload.text || payload.url || payload.html || payload.image;
  if (!hasData) return;

  const fingerprint = fingerprintClipboard(payload);
  if (fingerprint === lastClipboardFingerprint && Date.now() - lastClipboardTime < DUPLICATE_WINDOW_MS) {
    return;
  }

  lastClipboardFingerprint = fingerprint;
  lastClipboardTime = Date.now();

  console.log('📋 Clipboard captured:', {
    source: payload.source,
    hasText: Boolean(payload.text),
    hasHtml: Boolean(payload.html),
    hasImage: Boolean(payload.image),
    url: payload.url || null
  });

  sendToBackground({
    type: 'clipboard_changed',
    data: payload
  });
}

async function captureClipboardEvent(source, clipboardData) {
  if (!checkExtensionContext()) return;

  try {
    const payload = await buildClipboardPayload(source, clipboardData);
    sendClipboardPayload(payload);
  } catch (err) {
    console.error('Clipboard capture error:', err);
  }
}

function scheduleClipboardSnapshot(source, delay = 150) {
  if (!checkExtensionContext()) return;

  window.clearTimeout(clipboardPollTimer);
  clipboardPollTimer = window.setTimeout(() => {
    captureClipboardEvent(source, null);
  }, delay);
}

function shouldWatchClipboard() {
  return document.visibilityState === 'visible' && document.hasFocus();
}

function startClipboardWatcher() {
  if (clipboardPollEnabled) return;
  clipboardPollEnabled = true;

  const poll = async () => {
    if (!clipboardPollEnabled || !checkExtensionContext()) {
      clipboardPollEnabled = false;
      return;
    }

    if (shouldWatchClipboard()) {
      await captureClipboardEvent('clipboard_snapshot', null);
    }

    clipboardPollTimer = window.setTimeout(poll, 2200);
  };

  clipboardPollTimer = window.setTimeout(poll, 2200);
}

function stopClipboardWatcher() {
  clipboardPollEnabled = false;
  window.clearTimeout(clipboardPollTimer);
}

document.addEventListener('copy', (e) => {
  captureClipboardEvent('copy_event', e.clipboardData || null);
  scheduleClipboardSnapshot('copy_snapshot', 180);
});

document.addEventListener('cut', (e) => {
  captureClipboardEvent('cut_event', e.clipboardData || null);
  scheduleClipboardSnapshot('cut_snapshot', 180);
});

document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && ['c', 'x'].includes(e.key.toLowerCase())) {
    scheduleClipboardSnapshot('keyboard_shortcut', 220);
  }
});

document.addEventListener('click', (e) => {
  const target = e.target instanceof Element ? e.target.closest('button,[role="button"],a') : null;
  const label = (target?.textContent || target?.getAttribute?.('aria-label') || '').toLowerCase();
  if (label.includes('copy') || label.includes('share') || label.includes('link')) {
    scheduleClipboardSnapshot('button_copy', 260);
  }
}, true);

document.addEventListener('visibilitychange', () => {
  if (shouldWatchClipboard()) {
    scheduleClipboardSnapshot('visibility_focus', 120);
    startClipboardWatcher();
  } else {
    stopClipboardWatcher();
  }
});

window.addEventListener('focus', () => {
  scheduleClipboardSnapshot('window_focus', 120);
  startClipboardWatcher();
});

window.addEventListener('blur', () => {
  stopClipboardWatcher();
});

if (shouldWatchClipboard()) {
  startClipboardWatcher();
}

console.log('✅ Clipboard monitoring active');
}
