const fs = require('fs');
const path = require('path');

const replacements = [
  // Backgrounds & Surfaces
  [/([#])080d1a/gi, '$1000000'], // bg-primary
  [/8,\s*13,\s*26/g, '0, 0, 0'],
  [/([#])0d1424/gi, '$10a0a0a'], // bg-secondary
  [/([#])111827/gi, '$1121212'], // surface
  [/17,\s*24,\s*39/g, '18, 18, 18'],
  [/([#])1a2332/gi, '$11c1917'], // surface-2
  [/([#])1f2d3d/gi, '$1292524'], // surface-3
  [/([#])1e293b/gi, '$127272a'], // border
  [/([#])2d3748/gi, '$13f3f46'], // border-light
  
  // Accents (Indigo/Violet -> Orange/Amber)
  [/([#])6366f1/gi, '$1f97316'], // Primary Orange (orange-500)
  [/99,\s*102,\s*241/g, '249, 115, 22'],
  [/([#])818cf8/gi, '$1fdba74'], // Light Orange (orange-300)
  [/([#])4f46e5/gi, '$1ea580c'], // Dark Orange (orange-600)
  [/([#])8b5cf6/gi, '$1f59e0b'], // Violet -> Amber (amber-500)
  [/139,\s*92,\s*246/g, '245, 158, 11'],
  [/([#])a5b4fc/gi, '$1ffedd5'], // orange-100
  
  // Texts (Slate -> Zinc)
  [/([#])f1f5f9/gi, '$1fafafa'], // zinc-50
  [/([#])94a3b8/gi, '$1a1a1aa'], // zinc-400
  [/([#])64748b/gi, '$171717a']  // zinc-500
];

function processDir(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      if (file !== 'node_modules' && file !== 'dist') {
        processDir(fullPath);
      }
    } else {
      if (fullPath.endsWith('.css') || fullPath.endsWith('.jsx') || fullPath.endsWith('.js') || fullPath.endsWith('.html')) {
        let content = fs.readFileSync(fullPath, 'utf8');
        let original = content;
        for (const [regex, replace] of replacements) {
          content = content.replace(regex, replace);
        }
        if (content !== original) {
          fs.writeFileSync(fullPath, content, 'utf8');
          console.log(`Updated ${fullPath}`);
        }
      }
    }
  }
}

const targetDir = 'c:\\Users\\DELL\\Downloads\\Student-360TestingApp-main\\Student-360TestingApp-main\\src';
processDir(targetDir);
console.log('Done.');
