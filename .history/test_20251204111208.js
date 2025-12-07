// test.js  (or pdf-to-images.js)
// Usage:
//   node test.js "<DROPBOX_RAW_OR_DL_URL>" [maxPages]
// Requires:
//   npm i cloudinary node-fetch@2
// Set env:
//   CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET

const cloudinary = require('cloudinary').v2;
const fetch = require('node-fetch'); // v2 API
const fs = require('fs');
const path = require('path');

cloudinary.config({ cloud_name: "andyishere3", api_key: "151564772698668", api_secret: "JuisSxJyuR52o6Dw3H9Jx0tOKoI" });
function normalizeDropboxUrl(u) {
  if (!u) return u;
  if (!u.includes('dropbox.com')) return u;
  const base = u.split('?')[0];
  const params = new URLSearchParams(u.split('?')[1] || '');
  // prefer dl=1 for direct download
  params.set('dl', '1');
  // remove raw if present to avoid conflict
  params.delete('raw');
  return `${base}?${params.toString()}`;
}

function generateSignedPageUrl(srcUrl, page, ttlSec = 300) {
  const expiresAt = Math.floor(Date.now() / 1000) + ttlSec;
  return cloudinary.url(srcUrl, {
    type: 'fetch',
    resource_type: 'image',
    page: page,
    format: 'jpg',
    quality: 'auto',
    dpr: 'auto',
    sign_url: true,
    expires_at: expiresAt
  });
}

async function ensureDir(dir) {
  // Use fs.promises.mkdir with recursive option
  await fs.promises.mkdir(dir, { recursive: true });
}

async function downloadToFile(url, outPath) {
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} ${res.statusText} - ${body}`);
  }
  await ensureDir(path.dirname(outPath));
  const dest = fs.createWriteStream(outPath);
  return new Promise((resolve, reject) => {
    res.body.pipe(dest);
    res.body.on('error', reject);
    dest.on('finish', resolve);
    dest.on('error', reject);
  });
}

async function main() {
  const argv = process.argv.slice(2);
  if (!argv[0]) {
    console.error('Usage: node test.js "<DROPBOX_URL>" [maxPages]');
    process.exit(1);
  }

  const rawUrl = argv[0];
  const srcUrl = normalizeDropboxUrl(rawUrl);
  const maxPages = parseInt(argv[1] || '200', 10);
  const outDir = path.resolve(process.cwd(), 'out-pages');

  console.log('Source PDF URL:', srcUrl);
  console.log('Output directory:', outDir);

  let downloaded = 0;
  let consecutiveFails = 0;
  const failThreshold = 3;

  for (let p = 1; p <= maxPages; ++p) {
    try {
      console.log(`\nFetching page ${p} -> ${path.join(outDir, `page-${String(p).padStart(3,'0')}.jpg`)}`);
      const signed = generateSignedPageUrl(srcUrl, p, 300);
      console.log('[DEBUG] Cloudinary signed URL (open in browser to test):', signed);
      await downloadToFile(signed, path.join(outDir, `page-${String(p).padStart(3,'0')}.jpg`));
      console.log(`Saved page ${p}`);
      downloaded++;
      consecutiveFails = 0;
    } catch (err) {
      console.warn(`Page ${p} fetch failed: ${err.message}`);
      consecutiveFails++;
      if (consecutiveFails >= failThreshold) {
        console.log(`Stopping after ${consecutiveFails} consecutive failures.`);
        break;
      }
      // small delay before next attempt
      await new Promise(r => setTimeout(r, 400));
    }
  }

  console.log(`\nDone. Downloaded ${downloaded} pages (to ${outDir}).`);
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
