// upload-to-dropbox.js
// Node 18+ recommended

const fs = require('fs');
const path = require('path');
const { Dropbox } = require('dropbox');

const DROPBOX_TOKEN ="sl.u.AGLyFVwDRVMDdMDJtLSol-KQV4vg9SiJFIVCZp3BDt1PDJpmSsXPINlQYtcXIi3FqYjN-NcEn0k_UXm-A7LlFuGGaBag4oBnzu4kwcAw7STNdvfnB2IxWP0Sy9-lqaJsdFnoitHSav5XeFkaSHRyiNzZUaguAVm1oXlB5k-7JgIvVw4duVvufmvI70kM6CooWajjtvoJfOIjCYgJ9BbMZVPCrdWCJkd4yJW1NEhcJ96wIFt_qJvTMwWPrW0etf605Lc4EACjA3K52DNtDJN4Tq-ZTtDyXBOMhuXWIW7--c1Ue5Lg7AkH7a2apmhc0C367RJ6SaCex6BJv_N12f3WuU6mOs0AOdZVJlANSqvYQ0iUO38fQs21UnPWhM-znqK8E6S_PRL9kz3adugSnOdBo3LTJc2Ine5BJijTZEsP_jjRTpyNtOb731kFDxsZczZN0FgJpktnOoy7bBRzSWr_269POeoqc-rK1NXgKyzHZKBT3q9UUHvYE7zg-aOg9sV9rUD4lKA2e1MlhDa-d5c8jB9cYL8gaUGKDMfM8hXhTj_vlF22b_wQGoZNgtIoH_iMhh-PX6_3cAwqhfI6o-omv6nx6mZPBSEDoXeNXl9oVSK12qA9bXBoZWrZ1HhHpq4uaY9M8xc9I0GE5FhexTeeJLIVpjp2fvzf9vqQopsuiRx5eYT0Ca2dO-yPlsgb-Pl2thykgpOeK8yGykHsK2xWnrTorSzj7LI_xuUDB727s2a1x7Upa5LJijMKUTSJ1SczLqPo0-cTCdLfzLnPzLeHMxlKS_ao4jjUx0bNuQ8-REQmbs5BRNNFhJhcuOIk3Sezk1mIyYdd63-R-E4rpeMHyhkYhp2_fGHyqdljNPx42HCnMuwv8_gnkErkuAJosb0gLNthdWChMBMDjE-GzbG6ditwKV8L4rjXTL14oikUYj-1WvuOa-ja3D71ktm-2gmcWi-BQb1CEnmdMfiM6VTIx6JXb7ht3KuphOZRm9aYDl41FCWWT3j89UFQ8WmW5rJoMkb8c-RDDkzFWB1KXVNObfvHgSrc3msJFx96VMAZbxzUwEJz7hFV6I1rS_4Le78aUZ9afrMMmD-cqkys8D-rRGgMPOjBEvujGXWUwDoArFnNsMc1E-FlAXL64JzzGocg6UUdQXXD9f00dJUB2UFM-MWf-9aNwCOlxmMsafRAXzqOyNWi8MP6I33bOr9_Aj-NQCg7209NGuvxxcZe8ufNP5ju1WjGqNNffuF08NsNJkgzxAlt2F5u2M8GemCPmJA-jCjrOyzTVpB0spIKoCnIapVFaRHinHDOXacnt-MZnA892Z69oQ6vAokqDY4duiPYIAaJqHGOse1jzU6EFpuLLQceJHoOYVJDRfgOO14gpjBPkV7bgWBCMAZrzXlM8yCuWA7S75L5if2Yq_FkUGNRVUSSr_gpx4ji4bfFMOd4BNS9xrfhkkmxpk2iHy-n86p_47w";
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
