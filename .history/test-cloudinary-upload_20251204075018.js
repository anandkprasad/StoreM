const cloudinary = require('cloudinary').v2;
const path = require('path');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const pdfPath = path.join(__dirname, 'Ebook Proposal.pdf');

(async () => {
  try {
    const upload = await cloudinary.uploader.upload(pdfPath, {
      resource_type: 'raw',
      type: 'upload',
      folder: 'test-public'
    });
    console.log('Upload result:', upload);
    console.log('Secure URL:', upload.secure_url);
  } catch (err) {
    console.error('Cloudinary upload error:', err);
  }
})();
