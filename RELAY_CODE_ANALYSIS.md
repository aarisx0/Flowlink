# FlowLink relay.js Code Analysis

## File Overview
- **Path**: `extension/relay.js`
- **Lines**: 145 total
- **Purpose**: Browser extension interface for receiving and managing AI coding relays
- **Current Status**: Functional but limited

## Code Structure

### Section 1: Global State (Lines 1-2)
```javascript
let latestRelay = null;
let inbox = [];
```
**Analysis**: 
- Simple in-memory state management
- Holds current relay and history
- No persistence between browser sessions
- No limits on inbox size (kept to 10 per line 138)

### Section 2: DOM Element References (Lines 4-11)
```javascript
const promptText = document.getElementById('promptText');
const relayMeta = document.getElementById('relayMeta');
const statusText = document.getElementById('statusText');
const ideSelect = document.getElementById('ideSelect');
const inboxList = document.getElementById('inboxList');
const copyPromptBtn = document.getElementById('copyPromptBtn');
const launchIdeBtn = document.getElementById('launchIdeBtn');
const clearInboxBtn = document.getElementById('clearInboxBtn');
```
**Analysis**:
- Direct DOM element access
- No document ready checks
- Assumes relay.html has all elements
- Tight coupling to HTML structure

### Section 3: Helper Functions

#### formatIdeLabel (Lines 13-22)
```javascript
function formatIdeLabel(targetIde) {
  switch (targetIde) {
    case 'cursor': return 'Cursor';
    case 'windsurf': return 'Windsurf';
    case 'kiro': return 'Kiro';
    case 'opencode': return 'OpenCode';
    case 'vscode': return 'VS Code';
    default: return 'Auto';
  }
}
```
**Analysis**:
- Simple IDE name formatting
- Handles 5 specific IDEs + auto
- Used for UI display only
- Could be extracted to configuration

#### triggerCustomProtocol (Lines 24-30) - CRITICAL FUNCTION
```javascript
function triggerCustomProtocol(protocolUrl) {
  const iframe = document.createElement('iframe');
  iframe.style.display = 'none';
  iframe.src = protocolUrl;
  document.body.appendChild(iframe);
  window.setTimeout(() => iframe.remove(), 1500);
}
```
**Analysis**:
- **Method**: iframe-based protocol triggering
- **Hidden iframe**: Doesn't show visually
- **Timeout**: 1500ms after setting src
- **Limitation**: No error handling
- **Issue**: Fire-and-forget approach

**How it Works**:
1. Creates invisible iframe element
2. Sets iframe.src to protocol URL
3. Browser handles protocol dispatch
4. Iframe removed after 1.5 seconds
5. No confirmation if IDE launched

**Security**: 
- No CORS restrictions on protocol handlers
- No sanitization of protocol URL
- Potential for XSS if URL not properly encoded

**Enhancement Opportunity**:
```javascript
async function advancedTriggerProtocol(protocolUrl) {
  try {
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    
    // Add error handling
    iframe.onerror = () => {
      console.error('Protocol handler error');
      // Fallback logic
    };
    
    iframe.src = protocolUrl;
    document.body.appendChild(iframe);
    
    // Longer timeout for slower systems
    await new Promise(resolve => setTimeout(resolve, 2000));
    iframe.remove();
  } catch (error) {
    console.error('Failed to trigger protocol:', error);
  }
}
```

### Section 4: Render Functions

#### renderRelay (Lines 32-43)
```javascript
function renderRelay() {
  if (!latestRelay) {
    relayMeta.textContent = 'Waiting for a coding prompt...';
    promptText.value = '';
    ideSelect.value = 'auto';
    return;
  }
  
  relayMeta.textContent = `${latestRelay.sourceUsername} on ${latestRelay.sourceDeviceName} sent a prompt for ${formatIdeLabel(latestRelay.targetIde)}.`;
  promptText.value = latestRelay.prompt || '';
  ideSelect.value = latestRelay.targetIde || 'auto';
}
```
**Analysis**:
- Displays current relay in popup
- Shows source device information
- Sets IDE selector to target IDE
- Clean and simple UI update

#### renderInbox (Lines 45-64)
```javascript
function renderInbox() {
  if (!inbox.length) {
    inboxList.innerHTML = '<p class="empty">No prompts yet.</p>';
    return;
  }
  
  inboxList.innerHTML = '';
  inbox.forEach((relay, index) => {
    const item = document.createElement('button');
    item.className = 'inbox-item';
    item.type = 'button';
    item.innerHTML = `<h3>${relay.title || 'Remote AI Coding Relay'}</h3><p>${relay.sourceUsername}: ${(relay.prompt || '').slice(0, 120)}${(relay.prompt || '').length > 120 ? '...' : ''}</p>`;
    item.addEventListener('click', () => {
      latestRelay = relay;
      renderRelay();
      statusText.textContent = `Loaded relay ${index + 1} of ${inbox.length}.`;
    });
    inboxList.appendChild(item);
  });
}
```
**Analysis**:
- Shows history of received relays
- Truncates prompts to 120 chars in list
- Click to load relay for execution
- Good UX with visual feedback

### Section 5: State Loading (Lines 66-76)
```javascript
function loadState() {
  chrome.runtime.sendMessage({ type: 'get_ai_relay_state' }, (response) => {
    latestRelay = response?.latestAiRelay || null;
    inbox = Array.isArray(response?.aiRelayInbox) ? response.aiRelayInbox : [];
    if (!latestRelay && inbox.length) {
      latestRelay = inbox[0];
    }
    renderRelay();
    renderInbox();
  });
}
```
**Analysis**:
- Loads state from background service worker
- Uses optional chaining (?.) for safety
- Fallback to first inbox item if no latest
- Good defensive programming

**Communication Channel**: Uses Chrome message passing (IPC)

### Section 6: Clipboard Copy (Lines 78-86)
```javascript
async function copyPrompt() {
  if (!latestRelay?.prompt) {
    statusText.textContent = 'No prompt available to copy.';
    return;
  }
  
  await navigator.clipboard.writeText(latestRelay.prompt);
  statusText.textContent = 'Prompt copied to clipboard.';
}
```
**Analysis**:
- Uses modern Clipboard API (async)
- Copies full prompt (no truncation here)
- Good feedback message
- Handles missing prompt gracefully

**Note**: This is the user's manual fallback when IDE launch fails

### Section 7: IDE Launch - CORE FUNCTION (Lines 88-115) - CRITICAL

```javascript
function launchIde() {
  if (!latestRelay?.prompt) {
    statusText.textContent = 'No prompt available to launch.';
    return;
  }

  const targetIde = ideSelect.value || latestRelay.targetIde || 'auto';
  const protocolMap = {
    auto: ['cursor://', 'windsurf://', 'kiro://', 'vscode://'],
    cursor: ['cursor://'],
    windsurf: ['windsurf://'],
    kiro: ['kiro://'],
    opencode: [],
    vscode: ['vscode://']
  };

  const protocols = protocolMap[targetIde] || protocolMap.auto;
  if (!protocols.length) {
    statusText.textContent = 'No protocol available for this IDE here. Paste the copied prompt manually.';
    return;
  }

  protocols.forEach((protocol) => {
    triggerCustomProtocol(`${protocol}ai-relay?prompt=${encodeURIComponent(latestRelay.prompt.slice(0, 4000))}`);
  });

  statusText.textContent = `Tried to launch ${formatIdeLabel(targetIde)}. If it opens, paste the prompt into its AI chat.`;
}
```

**Analysis**:
- **AUTO mode**: Tries all IDEs in sequence (wasteful)
- **Protocol map**: Easy to add new IDEs
- **4000 char limit**: HARD-CODED (Line 111)
  - URL encoding causes character overhead
  - Large prompts will be truncated silently
  - No warning to user about truncation

**Data Flow**:
```
User Click → launchIde() → protocolMap lookup 
→ iterate protocols → triggerCustomProtocol() → iframe 
→ Browser OS → IDE installed on system → IDE opens
```

**Limitations**:
1. **Silent truncation**: Prompt cut without warning
2. **No IDE confirmation**: Doesn't verify if IDE opened
3. **Multiple launches**: Auto mode tries all IDEs (confusing)
4. **Manual paste**: User must manually paste into AI chat
5. **No result return**: Can't get code back
6. **No build trigger**: Can't automate builds

**Protocol URLs Generated**:
```
cursor://ai-relay?prompt=<BASE64_or_ENCODED_PROMPT>
windsurf://ai-relay?prompt=<BASE64_or_ENCODED_PROMPT>
vscode://ai-relay?prompt=<BASE64_or_ENCODED_PROMPT>
kiro://ai-relay?prompt=<BASE64_or_ENCODED_PROMPT>
```

**Issues with Current Appr
