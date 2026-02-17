/**
 * Generate FlowLink extension icons using Canvas
 * Run with: node create-icons.js
 */

const fs = require('fs');
const { createCanvas } = require('canvas');

function drawIcon(size) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  
  // Create gradient background
  const gradient = ctx.createLinearGradient(0, 0, size, size);
  gradient.addColorStop(0, '#667eea');
  gradient.addColorStop(1, '#764ba2');
  
  // Draw rounded rectangle background
  const radius = size * 0.15;
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.moveTo(radius, 0);
  ctx.lineTo(size - radius, 0);
  ctx.quadraticCurveTo(size, 0, size, radius);
  ctx.lineTo(size, size - radius);
  ctx.quadraticCurveTo(size, size, size - radius, size);
  ctx.lineTo(radius, size);
  ctx.quadraticCurveTo(0, size, 0, size - radius);
  ctx.lineTo(0, radius);
  ctx.quadraticCurveTo(0, 0, radius, 0);
  ctx.closePath();
  ctx.fill();
  
  // Draw connection symbol
  ctx.strokeStyle = 'white';
  ctx.fillStyle = 'white';
  ctx.lineWidth = size * 0.08;
  
  const circleRadius = size * 0.12;
  const centerX = size / 2;
  const centerY = size / 2;
  const offset = size * 0.25;
  
  // Left circle
  ctx.beginPath();
  ctx.arc(centerX - offset, centerY - offset, circleRadius, 0, Math.PI * 2);
  ctx.fill();
  
  // Right circle
  ctx.beginPath();
  ctx.arc(centerX + offset, centerY + offset, circleRadius, 0, Math.PI * 2);
  ctx.fill();
  
  // Connection line
  ctx.beginPath();
  ctx.moveTo(centerX - offset + circleRadius, centerY - offset + circleRadius);
  ctx.lineTo(centerX + offset - circleRadius, centerY + offset - circleRadius);
  ctx.stroke();
  
  // Center node
  ctx.beginPath();
  ctx.arc(centerX, centerY, circleRadius * 0.7, 0, Math.PI * 2);
  ctx.fill();
  
  return canvas;
}

// Check if canvas module is available
try {
  require.resolve('canvas');
  
  // Generate icons
  const sizes = [16, 48, 128];
  
  sizes.forEach(size => {
    const canvas = drawIcon(size);
    const buffer = canvas.toBuffer('image/png');
    fs.writeFileSync(`icons/icon${size}.png`, buffer);
    console.log(`✓ Created icon${size}.png`);
  });
  
  console.log('\n✅ All icons created successfully!');
  
} catch (err) {
  console.log('⚠️  Canvas module not installed.');
  console.log('To generate icons automatically, run:');
  console.log('  npm install canvas');
  console.log('\nAlternatively, open generate-icons.html in your browser');
  console.log('and download the icons manually.');
}
