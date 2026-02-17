#!/usr/bin/env python3
"""
Generate FlowLink extension icons from SVG
Requires: pip install pillow cairosvg
"""

import os
import sys

try:
    from cairosvg import svg2png
    
    # Read SVG
    with open('icons/icon.svg', 'r') as f:
        svg_data = f.read()
    
    # Generate different sizes
    sizes = [16, 48, 128]
    
    for size in sizes:
        output_file = f'icons/icon{size}.png'
        svg2png(bytestring=svg_data.encode('utf-8'), 
                write_to=output_file,
                output_width=size,
                output_height=size)
        print(f'✓ Created {output_file}')
    
    print('\n✅ All icons created successfully!')
    
except ImportError:
    print('⚠️  Required modules not installed.')
    print('To generate icons automatically, run:')
    print('  pip install pillow cairosvg')
    print('\nAlternatively, open generate-icons.html in your browser')
    print('and download the icons manually.')
    sys.exit(1)
except Exception as e:
    print(f'❌ Error: {e}')
    print('\nPlease use generate-icons.html in your browser instead.')
    sys.exit(1)
