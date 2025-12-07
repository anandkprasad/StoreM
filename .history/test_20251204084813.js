// upload-to-dropbox.js
// Node 18+ recommended

const fs = require('fs');
const path = require('path');
const { Dropbox } = require('dropbox');

const DROPBOX_TOKEN = process.env.DROPBOX_TOKEN;
if (!DROPBOX_TOKEN) {
  console.error('Please set DROPBOX_TOKEN environment variable.');
  process.exit(1);
}

const dbx = new Dropbox({ accessToken: DROPBOX_TOKEN, fetch: globalThis.fetch });

function safeName(name) {
  return name.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_\-\.]/g, '');
}

async function uploadFileToDropbox(localFilePath) {
  const filename = path.basename(localFilePath);
  const safe = safeName(filename);
  const dropboxPath = `/ebooks/${Date.now()}_${safe}`;
  const fileBuffer = fs.readFileSync(localFilePath);

  console.log('Uploading to Dropbox as:', dropboxPath);

  const uploadRes = await dbx.filesUpload({
    path: dropboxPath,
    contents: fileBuffer,
    mode: { '.tag': 'add' },
    autorename: true,
    mute: true
  });

  const uploadedPath = uploadRes.result && uploadRes.result.path_lower;
  if (!uploadedPath) throw new Error('Upload failed: no path returned.');

  // create or fetch shared link
  let shared;
  try {
    shared = await dbx.sharingCreateSharedLinkWithSettings({ path: uploadedPath });
  } catch (err) {
    const errSummary = err?.error?.error_summary || err.message || String(err);
    if (errSummary.toLowerCase().includes('shared_link_already_exists')) {
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

  const sharedUrl = shared.result.url;
  let rawUrl = sharedUrl.includes('?dl=0') ? sharedUrl.replace('?dl=0', '?raw=1') :
               sharedUrl.includes('?dl=1') ? sharedUrl.replace('?dl=1', '?raw=1') :
               `${sharedUrl}?raw=1`;

  return { dropbox_path: uploadedPath, shared_url: sharedUrl, raw_url: rawUrl };
}

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
