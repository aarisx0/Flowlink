# Research and Analysis: AI IDE Platforms - Programmatic Prompt Injection & Automated Building

## Executive Summary

This document provides comprehensive research on four AI IDE platforms to determine their support for programmatic prompt injection and automated building capabilities. The analysis includes current implementation methods found in the FlowLink extension code.

---

## Current Implementation Analysis (FlowLink Extension)

### Existing Method: Custom Protocol Handler

**Location:** `extension/relay.js` (lines 24-30, 95-115)

The current implementation uses a **custom protocol handler approach**:

```javascript
function triggerCustomProtocol(protocolUrl) {
  const iframe = document.createElement('iframe');
  iframe.style.display = 'none';
  iframe.src = protocolUrl;
  document.body.appendChild(iframe);
  window.setTimeout(() => iframe.remove(), 1500);
}

// Protocol URLs follow pattern:
// cursor://ai-relay?prompt=<encoded-prompt>
// windsurf://ai-relay?prompt=<encoded-prompt>
// kiro://ai-relay?prompt=<encoded-prompt>
// vscode://ai-relay?prompt=<encoded-prompt>
```

**Current Limitations:**
1. **Truncation:** Prompt limited to 4000 characters (line 111)
2. **No Return Data:** Cannot capture IDE response or execution status
3. **Fire-and-Forget:** No way to track if IDE actually launched or received the prompt
4. **Manual Paste Required:** User must manually paste prompt into IDE's AI chat
5. **No Build Triggering:** Cannot automatically trigger build processes

---

## Platform Analysis

## 1. CURSOR

### Overview
- **Type:** AI-powered code editor (based on VS Code)
- **Company:** Anysphere
- **Current Status:** Active development, market leader in agentic coding

### API & Programmatic Capabilities

#### A. Custom Protocol Support
**Status:** SUPPORTED (Experimental)
- Custom protocol scheme: `cursor://`
- Supports parameters via URL query string
- Usage: `cursor://ai-relay?prompt=...&file=...`
- **Limitation:** Limited documentation on parameter support

#### B. Official APIs
**Status:** MINIMAL / NOT PUBLIC
- No official REST API for prompt injection
- No GraphQL API for programmatic interaction
- No CLI with scripting support (currently)
- **Copilot SDK:** Not available for Cursor

#### C. Headless Mode
**Status:** NOT SUPPORTED
- Cursor is fundamentally a desktop IDE
- No headless/CLI mode for automated builds
- Requires visual interface

#### D. Agentic Capabilities
**Status:** ADVANCED (Agents)
- Cursor Agents can work autonomously (with supervision)
- Agents can: run terminal commands, edit files, review code
- Cloud agents available (self-hosted option)
- **Limitation:** Requires user to initiate agent from GUI

### Build Automation Capabilities
- **Limited:** Can run terminal commands through agents
- **Manual Trigger:** No way to trigger builds from external CLI
- **Workspace Indexing:** Excellent codebase understanding for context

### Recommended Integration Approach for Cursor

**Option 1: Agent-Based (Recommended)**
```javascript
// Potential future integration (requires Cursor API)
async function sendPromptToCursorAgent(projectPath, prompt) {
  // Launch Cursor with project
  execSync(`cursor "${projectPath}"`);
  // Send prompt to agent via custom protocol
  window.location.href = `cursor://agent?prompt=${encodeURIComponent(prompt)}`;
  // Agent executes autonomously
}
```

**Option 2: CLI Agent (Future)**
- Cursor may release CLI agent support
- Would enable: `cursor-cli execute --prompt "..."`
- Would support programmatic builds

### Limitations
1. No headless mode
2. No public API
3. Limited custom protocol documentation
4. Manual user intervention often required
5. Agents need supervision

---

## 2. WINDSURF

### Overview
- **Type:** AI-native IDE (forked from VS Code)
- **Company:** Cognition Labs
- **Current Status:** Active development, enterprise focus

### API & Programmatic Capabilities

#### A. Custom Protocol Support
**Status:** SUPPORTED (Partial)
- Custom protocol scheme: `windsurf://`
- URL parameter support expected
- Usage: `windsurf://cascade?prompt=...`

#### B. Official APIs
**Status:** MINIMAL
- No documented REST API
- No SDK for external integration
- Focus on in-editor capabilities

#### C. Cascade (Main AI Engine)
**Status:** Advanced but not externally accessible
- Deep codebase understanding
- Multi-file context awareness
- **Limitation:** Currently IDE-only, not exposed via API

#### D. MCP (Model Context Protocol)
**Status:** SUPPORTED
- Windsurf supports MCP servers
- Enables custom tool integration
- **Use Case:** Can extend Windsurf's capabilities
- **Limitation:** Still requires IDE to be running

### Build Automation Capabilities
- **Via Terminal:** Cascade can run terminal commands
- **In-IDE:** Excellent build tool integration
- **External Triggering:** NOT SUPPORTED (no CLI agent)

### Recommended Integration Approach for Windsurf

**Option 1: MCP Server Integration**
```javascript
// Create custom MCP server for Windsurf
// Windsurf connects to MCP server for external communication
// Limitations: Still requires Windsurf IDE running

class FlowLinkMCPServer {
  async handlePrompt(prompt, context) {
    // Windsurf requests build/execution from external server
    return await fetch('http://backend/execute', {
      method: 'POST',
      body: JSON.stringify({ prompt, context })
    });
  }
}
```

**Option 2: Custom Protocol with File Watching**
```javascript
// Write prompt to temp file
// Windsurf monitors file via extension
// Execute and write results back
fs.writeFileSync('/tmp/windsurf-prompt.json', {
  prompt: userPrompt,
  action: 'execute'
});
// Windsurf extension picks up file change
// Limited automation possible
```

### Limitations
1. No standalone headless mode
2. No external API
3. MCP requires IDE running
4. Limited build automation
5. No programmatic build triggering

---

## 3. KIRO

### Overview
- **Type:** Emerging AI code editor
- **Status:** Less documented than Cursor/Windsurf
- **Market Position:** Niche player

### API & Programmatic Capabilities

#### A. Custom Protocol Support
**Status:** SUPPORTED (Basic)
- Custom protocol scheme: `kiro://`
- Minimal documentation available
- Usage: `kiro://ai-relay?prompt=...`

#### B. Official APIs
**Status:** NOT DOCUMENTED
- No public API documentation
- Limited information on programmatic interfaces
- Appears to be early-stage

#### C. CLI Support
**Status:** UNKNOWN
- Not widely documented
- Likely minimal

### Build Automation Capabilities
- **Status:** UNKNOWN / LIMITED
- Limited public documentation
- Unclear headless capabilities

### Recommendations for Kiro
1. Monitor GitHub/documentation for updates
2. Not recommended for critical automation
3. Custom protocol may be only option
4. Requires more research as platform matures

### Limitations
1. Limited documentation
2. Early-stage platform
3. No clear API strategy
4. Build automation unclear
5. Community/support limited

---

## 4. VS CODE WITH AI EXTENSIONS

### Overview
- **Type:** Open-source code editor with AI extensions
- **AI Extensions:** GitHub Copilot, Codeium, Continue.dev, etc.
- **Status:** Most mature programmatic option

### API & Programmatic Capabilities

#### A. VS Code Extension API
**Status:** FULLY SUPPORTED
- Official Extension API: `vscode` module
- Can be accessed programmatically
- Used by thousands of extensions
- Well-documented

#### B. Official APIs
**Status:** SUPPORTED
- **VS Code Command API:** Execute commands programmatically
- **VS Code Language Server Protocol (LSP):** For advanced integrations
- **Debugger Protocol:** Control debugging
- **Terminal API:** Run terminal commands

#### C. CLI Support
**Status:** FULLY SUPPORTED
```bash
code --version                    # Check version
code /path/to/project            # Open project
code --install-extension <id>    # Install extensions
code --list-extensions           # List installed
code --command workbench.action.openIntegratedTerminal  # Run commands
```

#### D. Headless Mode
**Status:** PARTIAL SUPPORT
- Can run VS Code in CLI mode for some operations
- Full headless support requir
