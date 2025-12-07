const cloudinary = require('cloudinary').v2;
const path = require('path');

cloudinary.config({
  cloud_name: "andyishere3",
  api_key: "151564772698668",
  api_secret: "JuisSxJyuR52o6Dw3H9Jx0tOKoI"
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
