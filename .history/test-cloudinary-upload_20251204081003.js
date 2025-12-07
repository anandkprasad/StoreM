const cloudinary = require('cloudinary').v2;
const path = require('path');

cloudinary.config({
  cloud_name: "",
  api_key: "",
  api_secret: ""
});

const pdfPath = path.join(__dirname, 'Ebook Proposal.pdf');

(async () => {
  try {
    // Delete any previous file with the same public_id
    await cloudinary.uploader.destroy('test-public/mybook-fresh-v1', {
      resource_type: 'raw',
      type: 'upload'
    });
    console.log('Previous file deleted (if existed).');

    // Upload with new public_id
    const upload = await cloudinary.uploader.upload(pdfPath, {
      resource_type: 'raw',
      type: 'upload',
      folder: 'test-public',
      public_id: 'mybook-fresh-v1',
      access_mode: 'public'
    });
    console.log('Upload result:', upload);
    console.log('Secure URL:', upload.secure_url);
  } catch (err) {
    console.error('Cloudinary upload error:', err);
  }
})();
