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


const dbx = new Dropbox({ accessToken: "sl.u.AGLUqBlb6dZLbGyBgiFjMC1tNrT6fLC-O8aMdRoMJ_iJVt-pAqU7hme8j8he5bA_2fOA11yRPf4NhsOIiZuxUXr_3V_FSYZPUZXto06N1eo2RyGLe_l5xnLGxPCjDclHvYAMkkjIbWZZahigFACE6bEoUWNQhOzCRiYIy2q71qjLFHwsoQ7hoUfYzkxVh7GuICUda7rvyUIbguWFBj-lhJXR07pYosTVeroIsMrg_VCZLsPdeL2hFlqw-L_uvq84bfQiOgTTX79CzhNu7hkOKayCgvXt5lvBseMR0pdPE5DOQiaPGzz4yFOj7wn1rBIK7ajRJ-KNK4PigGHRQCpFv1h-Go6RszJrbYFQkV62jzQL2tBELaN-XeTfUC8JSlNtSISq9-Ekmh_L_54jWbOX9-WLD4MWw7jurJvH4Ml1vx6Sw9UX2cd8Lde_4S1Ff2NkCyrT9xUv1UsFY_J2r25H0BJA0f5pUb2MU82q0H5TWtv8hPzA7nCeU796OxcaRPEvgCVpyzBJLuaaer-yklLk_YYR4eLTLRhEq4XKYVXW18BIDyB-7qzpRlf6xWuhsXsknH8yi6xNiEKrhSuzEk0oAdSXEjxe9QyQ14PvPKP_evalUWmed4sKuQaQ8Hz5EjeGP6UeTChdOt3MgPFgIoBcdTFxCKwWO3D6IYeVC4N7t4CvYyGVi3Fau713Tnvz5K1-5LmY2yWofeCRdhUuC7OvnGXFQaIRUdmVFuEOiRqGL125j7phzdClTx3XWAOuv_626JoSB4W79vIqqbpcdJb-2InzV1pUwIhEDYsDJf_aNBHOb_dRgFSXKzvMZV4sIToXdymX0aG6nroRsygbw6zX4_BHc3ZDCamopY0Z0DxCfUpaN3lUGZ4Ix1opam3KqBwN565u_3_V-NBzHmPy6164oeTBMjrF3ZDjxpYZbOTVuM4ILu0YQFp2zP3l_Dj3B6AmKYeoA-t9MWqptrINDbDiDU2lxn1J1kiHz49LihaxwvzAchD6mi9YPFPonq8fqS1AWKk_ojAvcqeV2yEAGInblP1DAq2HGs7SNPYP4ZI_yTMW8qeWTuI3Kv0Q-sP9PU5WPuvCEACupuRZp4TjX7jyw7eZo7q2JSSVcJQYf89C7VyrqCprm6sHRgEa96LWCCiInegWajH0sE5r67QZg1NhymC2K69N8cx46IWx0KH951tQnLJqQs7rk9FdPpSOFlESq3HzSKIlEDlk1GPnyOJM6qqTZdwB4s1VtoJJ7sCxIowa9h470pHteEDMT3l82dxgPxxepBZ-s_SZlg4l_VZM7aFqgVyHdJ987a7GhOolnr3fbqicfPJJ0k1DZ2yRebDUc56w9J1KvSGYi1oiAhr3fsif2iuMOES5Ug6kmJTv8E8DHLUesyZdSoekT0tOlx7Wqpp3WZU-QmMG2U-n8LUfypcRyO5qhCwQaa08l2BYLLmBnk2DU8uSyJrD_89ctBV6TJ8", fetch });

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
