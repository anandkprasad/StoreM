// pdf-to-images.js
// Usage: node pdf-to-images.js "https://www.dropbox.com/....?raw=1" [maxPages]
//
// Requirements:
//   npm i cloudinary node-fetch@2 mkdirp
//   set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET in env

const cloudinary = require('cloudinary').v2;
const fetch = require('node-fetch'); // v2 API (streams)
const fs = require('fs');
const path = require('path');
const mkdirp = require('mkdirp');



cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

async function generateSignedPageUrl(srcUrl, page, ttlSec = 300) {
  // expires_at needs unix seconds
  const expiresAt = Math.floor(Date.now() / 1000) + ttlSec;
  // Use type: 'fetch' and resource_type: 'image' and page param to render PDF page as image
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

async function downloadToFile(url, outPath) {
  const res = await fetch(url);
  if (!res.ok) {
    const txt = await res.text().catch(()=>'<no-body>');
    throw new Error(`HTTP ${res.status} ${res.statusText} - ${txt}`);
  }
  // ensure folder exists
  await mkdirp(path.dirname(outPath));
  const dest = fs.createWriteStream(outPath);
  await new Promise((resolve, reject) => {
    res.body.pipe(dest);
    res.body.on('error', reject);
    dest.on('finish', resolve);
    dest.on('error', reject);
  });
}

async function main() {
  const argv = process.argv.slice(2);
  if (!argv[0]) {
    console.error('Usage: node pdf-to-images.js "<DROPBOX_RAW_URL>" [maxPages]');
    process.exit(1);
  }

  const srcUrl = argv[0];
  const maxPages = parseInt(argv[1] || '200', 10); // safety cap
  const outDir = path.resolve(process.cwd(), 'out-pages');

  console.log('Source PDF URL:', srcUrl);
  console.log('Output directory:', outDir);

  // We'll try pages 1..maxPages. Stop when we get consecutive failures.
  const consecutiveFailThreshold = 3;
  let consecutiveFails = 0;
  let downloaded = 0;

  for (let p = 1; p <= maxPages; ++p) {
    try {
      const signed = await generateSignedPageUrl(srcUrl, p, 300); // 5 min TTL
      const outPath = path.join(outDir, `page-${String(p).padStart(3,'0')}.jpg`);
      console.log(`Fetching page ${p} -> ${outPath}`);
      await downloadToFile(signed, outPath);
      console.log(`Saved page ${p}`);
      downloaded += 1;
      consecutiveFails = 0; // reset
    } catch (err) {
      // For pages beyond the PDF length Cloudinary may return 400/404 or other error text.
      console.warn(`Page ${p} fetch failed: ${err.message}`);
      consecutiveFails += 1;
      if (consecutiveFails >= consecutiveFailThreshold) {
        console.log(`Stopping after ${consecutiveFailThreshold} consecutive failures (likely no more pages).`);
        break;
      } else {
        // brief pause then continue to next page to be robust vs transient errors
        await new Promise(r => setTimeout(r, 500));
      }
    }
  }

  console.log(`Done. Downloaded ${downloaded} pages (to ${outDir}).`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
