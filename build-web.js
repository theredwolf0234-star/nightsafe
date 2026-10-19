const fs = require('fs');
const path = require('path');

console.log('[Build] Preparing static deployment assets for Vercel...');

const publicDir = path.join(__dirname, 'public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

function copyRecursive(src, dest) {
  if (!fs.existsSync(src)) return;
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
    fs.readdirSync(src).forEach(file => {
      if (file === '__pycache__' || file.endsWith('.pyc')) return;
      copyRecursive(path.join(src, file), path.join(dest, file));
    });
  } else {
    fs.copyFileSync(src, dest);
  }
}

// Copy web files to public
copyRecursive(path.join(__dirname, 'index.html'), path.join(publicDir, 'index.html'));
copyRecursive(path.join(__dirname, 'css'), path.join(publicDir, 'css'));
copyRecursive(path.join(__dirname, 'js'), path.join(publicDir, 'js'));
copyRecursive(path.join(__dirname, 'assets'), path.join(publicDir, 'assets'));
copyRecursive(path.join(__dirname, 'backend', 'ai_risk_engine'), path.join(publicDir, 'backend', 'ai_risk_engine'));
copyRecursive(path.join(__dirname, 'backend', 'data'), path.join(publicDir, 'backend', 'data'));

copyRecursive(path.join(__dirname, 'manifest.json'), path.join(publicDir, 'manifest.json'));
copyRecursive(path.join(__dirname, 'sw.js'), path.join(publicDir, 'sw.js'));

// Also sync web files to Android assets if present
const androidWwwDir = path.join(__dirname, 'android', 'app', 'src', 'main', 'assets', 'www');
if (fs.existsSync(androidWwwDir)) {
  copyRecursive(path.join(__dirname, 'index.html'), path.join(androidWwwDir, 'index.html'));
  copyRecursive(path.join(__dirname, 'css'), path.join(androidWwwDir, 'css'));
  copyRecursive(path.join(__dirname, 'js'), path.join(androidWwwDir, 'js'));
  copyRecursive(path.join(__dirname, 'backend', 'ai_risk_engine'), path.join(androidWwwDir, 'backend', 'ai_risk_engine'));
  console.log('[Build] Synced updated web assets to android assets www directory.');
}

console.log('[Build] Successfully prepared public/ output directory for Vercel!');
