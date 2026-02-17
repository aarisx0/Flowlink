/**
 * Validate FlowLink Extension Files
 * Checks that all required files exist and are valid
 */

const fs = require('fs');
const path = require('path');

let errors = 0;
let warnings = 0;

function log(emoji, message, type = 'info') {
  console.log(`${emoji} ${message}`);
  if (type === 'error') errors++;
  if (type === 'warning') warnings++;
}

function checkFile(filePath, required = true) {
  const fullPath = path.join('extension', filePath);
  if (fs.existsSync(fullPath)) {
    const stats = fs.statSync(fullPath);
    log('✅', `${filePath} (${stats.size} bytes)`);
    return true;
  } else {
    if (required) {
      log('❌', `${filePath} - MISSING (required)`, 'error');
    } else {
      log('⚠️', `${filePath} - missing (optional)`, 'warning');
    }
    return false;
  }
}

function validateJSON(filePath) {
  try {
    const content = fs.readFileSync(path.join('extension', filePath), 'utf8');
    JSON.parse(content);
    log('✅', `${filePath} - Valid JSON`);
    return true;
  } catch (err) {
    log('❌', `${filePath} - Invalid JSON: ${err.message}`, 'error');
    return false;
  }
}

function validateJS(filePath) {
  try {
    const content = fs.readFileSync(path.join('extension', filePath), 'utf8');
    // Basic syntax check
    new Function(content);
    log('✅', `${filePath} - Valid JavaScript`);
    return true;
  } catch (err) {
    log('❌', `${filePath} - Syntax error: ${err.message}`, 'error');
    return false;
  }
}

console.log('🔍 Validating FlowLink Extension Files\n');

// Check required files
console.log('📦 Core Extension Files:');
checkFile('manifest.json', true);
checkFile('background.js', true);
checkFile('popup.html', true);
checkFile('popup.js', true);
checkFile('popup.css', true);
checkFile('content-media.js', true);
checkFile('content-clipboard.js', true);

console.log('\n🎨 Icon Files:');
checkFile('icons/icon16.png', true);
checkFile('icons/icon48.png', true);
checkFile('icons/icon128.png', true);

console.log('\n📚 Documentation Files:');
checkFile('README.md', false);
checkFile('QUICKSTART.md', false);

console.log('\n🛠️ Utility Files:');
checkFile('generate-icons.html', false);
checkFile('test-extension.html', false);

// Validate JSON files
console.log('\n🔍 Validating JSON Files:');
validateJSON('manifest.json');

// Validate JavaScript files
console.log('\n🔍 Validating JavaScript Files:');
validateJS('background.js');
validateJS('popup.js');
validateJS('content-media.js');
validateJS('content-clipboard.js');

// Check manifest.json structure
console.log('\n🔍 Checking Manifest Structure:');
try {
  const manifest = JSON.parse(fs.readFileSync('extension/manifest.json', 'utf8'));
  
  if (manifest.manifest_version === 3) {
    log('✅', 'Manifest V3 detected');
  } else {
    log('❌', 'Manifest V3 required', 'error');
  }
  
  if (manifest.permissions && manifest.permissions.includes('clipboardRead')) {
    log('✅', 'Clipboard permissions configured');
  } else {
    log('❌', 'Clipboard permissions missing', 'error');
  }
  
  if (manifest.background && manifest.background.service_worker) {
    log('✅', 'Background service worker configured');
  } else {
    log('❌', 'Background service worker missing', 'error');
  }
  
  if (manifest.content_scripts && manifest.content_scripts.length >= 2) {
    log('✅', `${manifest.content_scripts.length} content scripts configured`);
  } else {
    log('❌', 'Content scripts missing or incomplete', 'error');
  }
  
} catch (err) {
  log('❌', `Failed to parse manifest.json: ${err.message}`, 'error');
}

// Check backend integration
console.log('\n🔌 Checking Backend Integration:');
try {
  const backgroundJS = fs.readFileSync('extension/background.js', 'utf8');
  
  if (backgroundJS.includes('BACKEND_URL')) {
    log('✅', 'Backend URL configured');
  } else {
    log('❌', 'Backend URL not found', 'error');
  }
  
  if (backgroundJS.includes('media_handoff')) {
    log('✅', 'Media handoff message handling present');
  } else {
    log('❌', 'Media handoff handling missing', 'error');
  }
  
  if (backgroundJS.includes('clipboard_broadcast')) {
    log('✅', 'Clipboard broadcast handling present');
  } else {
    log('❌', 'Clipboard broadcast handling missing', 'error');
  }
  
} catch (err) {
  log('❌', `Failed to read background.js: ${err.message}`, 'error');
}

// Summary
console.log('\n' + '='.repeat(60));
console.log(`📊 Validation Summary: ${errors} errors, ${warnings} warnings`);

if (errors === 0 && warnings === 0) {
  log('🎉', 'All checks passed! Extension is ready to load.');
  console.log('\n📝 Next steps:');
  console.log('   1. Open Chrome and go to chrome://extensions/');
  console.log('   2. Enable "Developer mode"');
  console.log('   3. Click "Load unpacked"');
  console.log('   4. Select the "extension" folder');
  console.log('   5. Set your username in the extension popup');
} else if (errors === 0) {
  log('✅', 'No critical errors found. Extension should work.');
  log('⚠️', `${warnings} optional files missing (not critical).`);
} else {
  log('❌', `${errors} critical errors found. Please fix before loading.`);
  process.exit(1);
}
