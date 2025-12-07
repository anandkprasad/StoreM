// Dropbox PDF upload utility
const Dropbox = require('dropbox').Dropbox;
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

// User must provide Dropbox access token
const DROPBOX_ACCESS_TOKEN = 'YOUR_DROPBOX_ACCESS_TOKEN_HERE';

const dbx = new Dropbox({ accessToken: DROPBOX_ACCESS_TOKEN, fetch });

async function uploadPDF(localPath, dropboxPath) {
  try {
    const fileContent = fs.readFileSync(localPath);
    const response = await dbx.filesUpload({
      path: dropboxPath,
      contents: fileContent,
      mode: 'overwrite',
      autorename: false,
      mute: false,
    });
    // Create a shared link (public)
    const sharedLinkRes = await dbx.sharingCreateSharedLinkWithSettings({ path: dropboxPath });
    // Modify link to force direct download/view
    const publicUrl = sharedLinkRes.url.replace('?dl=0', '?raw=1');
    console.log('Public URL:', publicUrl);
    return publicUrl;
  } catch (err) {
    console.error('Dropbox upload error:', err);
    throw err;
  }
}

// Example usage:
const pdfPath = path.join(__dirname, 'Ebook Proposal.pdf');
uploadPDF(pdfPath, '/pdfs/mybook-dropbox.pdf');
