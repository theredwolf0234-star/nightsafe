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

if (fs.existsSync(path.join(__dirname, 'SafeRoute-AI.apk'))) {
  copyRecursive(path.join(__dirname, 'SafeRoute-AI.apk'), path.join(publicDir, 'SafeRoute-AI.apk'));
}

console.log('[Build] Successfully prepared public/ output directory for Vercel!');
