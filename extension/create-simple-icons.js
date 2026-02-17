/**
 * Create simple placeholder icons without external dependencies
 * These are minimal 1x1 colored pixels that will be scaled
 */

const fs = require('fs');

// Create a simple PNG (1x1 purple pixel) - this is a valid PNG file
const createSimplePNG = (size) => {
  // PNG header and data for a 1x1 purple pixel
  const pngData = Buffer.from([
    0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, // PNG signature
    0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52, // IHDR chunk
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, // 1x1 dimensions
    0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
    0xDE, 0x00, 0x00, 0x00, 0x0C, 0x49, 0x44, 0x41, // IDAT chunk
    0x54, 0x08, 0xD7, 0x63, 0x60, 0x60, 0xF8, 0x0F,
    0x00, 0x00, 0x04, 0x00, 0x01, 0x5C, 0xCD, 0xFF,
    0x8E, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, // IEND chunk
    0x44, 0xAE, 0x42, 0x60, 0x82
  ]);
  
  return pngData;
};

// Create icons directory if it doesn't exist
if (!fs.existsSync('icons')) {
  fs.mkdirSync('icons');
}

// Generate placeholder icons
const sizes = [16, 48, 128];

sizes.forEach(size => {
  const pngData = createSimplePNG(size);
  fs.writeFileSync(`icons/icon${size}.png`, pngData);
  console.log(`✓ Created placeholder icon${size}.png`);
});

console.log('\n✅ Placeholder icons created!');
console.log('⚠️  These are minimal placeholders.');
console.log('For better icons, open generate-icons.html in your browser.');
