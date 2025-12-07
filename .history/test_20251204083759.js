/**
 * upload-to-dropbox.js
 *
 * Usage:
 *   1) npm install dropbox node-fetch
 *   2) export DROPBOX_TOKEN="sl.xxxxx"   (or use a .env loader)
 *   3) node upload-to-dropbox.js /path/to/file.pdf
 *
 * What it does:
 *  - Uploads the file to /apps/<your-app-folder>/ebooks/<timestamp>_<filename>
 *  - Creates (or fetches) a shared link
 *  - Converts the shared link to a raw link (suitable for <iframe> via ?raw=1)
 *  - Prints JSON with dropbox_path, shared_url and raw_url
 *
 * Notes:
 *  - Requires a Dropbox access token (Generated token from your Dropbox App Console).
 *  - This script uses memory upload (reads file into buffer) — fine for small files.
 */

const fs = require('fs');
const path = require('path');
const { Dropbox } = require('dropbox');
const fetch = require('node-fetch');

if (!process.env.DROPBOX_TOKEN) {
  console.error('ERROR: DROPBOX_TOKEN environment variable not set.');
  console.error('Get a token at https://www.dropbox.com/developers/apps -> your app -> Generate access token');
  process.exit(1);
}

const dbx = new Dropbox({ accessToken: process.env.DROPBOX_TOKEN, fetch });

function safeName(name) {
  return name.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_\-\.]/g, '');
}

async function uploadFileToDropbox(localFilePath) {
  const filename = path.basename(localFilePath);
  const safe = safeName(filename);
  const dropboxPath = `/ebooks/${Date.now()}_${safe}`; // app-folder style path

  const fileBuffer = fs.readFileSync(localFilePath);

  console.log('Uploading to Dropbox as:', dropboxPath);

  // filesUpload requires contents as Buffer
  const uploadRes = await dbx.filesUpload({
    path: dropboxPath,
    contents: fileBuffer,
    mode: { '.tag': 'add' },
    autorename: true,
    mute: true
  });

  // uploadRes.result.path_lower contains the path
  const uploadedPath = uploadRes.result && uploadRes.result.path_lower;
  if (!uploadedPath) {
    throw new Error('Upload failed: no path returned.');
  }

  // Try to create a shared link; if it already exists, handle the error and fetch existing
  let shared;
  try {
    shared = await dbx.sharingCreateSharedLinkWithSettings({ path: uploadedPath });
  } catch (err) {
    const errSummary = err?.error?.error_summary || err.message || String(err);
    // If shared link already exists, list and take the first
    if (errSummary && errSummary.toLowerCase().includes('shared_link_already_exists')) {
      const list = await dbx.sharingListSharedLinks({ path: uploadedPath, direct_only: true });
      if (list.result && list.result.links && list.result.links.length) {
        shared = { result: list.result.links[0] };
      } else {
        throw new Error('Shared link already exists but could not retrieve it.');
      }
    } else {
      throw err;
    }
  }

  const sharedUrl = shared.result.url; // e.g. https://www.dropbox.com/s/XXXX/filename.pdf?dl=0
  // Convert to a raw embeddable link
  let rawUrl = sharedUrl;
  if (rawUrl.includes('?dl=0')) rawUrl = rawUrl.replace('?dl=0', '?raw=1');
  else if (rawUrl.includes('?dl=1')) rawUrl = rawUrl.replace('?dl=1', '?raw=1');
  else rawUrl = `${rawUrl}?raw=1`;

  return {
    dropbox_path: uploadedPath,
    shared_url: sharedUrl,
    raw_url: rawUrl
  };
}

// CLI
(async () => {
  try {
    const argv = process.argv.slice(2);
    if (!argv[0]) {
      console.error('Usage: node upload-to-dropbox.js /path/to/file.pdf');
      process.exit(1);
    }
    const filePath = argv[0];
    if (!fs.existsSync(filePath)) {
      console.error('ERROR: File not found:', filePath);
      process.exit(1);
    }

    const result = await uploadFileToDropbox(filePath);
    console.log('Upload successful!');
    console.log(JSON.stringify(result, null, 2));
    console.log('\nYou can embed the raw_url in an <iframe> like:\n  <iframe src="' + result.raw_url + '"></iframe>\n');
  } catch (err) {
    console.error('Upload failed:', err);
    process.exit(1);
  }
})();
