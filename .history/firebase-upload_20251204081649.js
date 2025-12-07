// Firebase PDF upload utility
const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

// Load service account from JSON file (user must provide)
const serviceAccount = require('./serviceAccount.json'); // Place your JSON here

// Your bucket name (user must provide)
const bucketName = 'YOUR_BUCKET_NAME_HERE';

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: bucketName
});

const bucket = admin.storage().bucket();

async function uploadPDF(localPath, destFileName) {
  try {
    const options = {
      destination: destFileName,
      public: true,
      metadata: {
        contentType: 'application/pdf',
      },
    };
    await bucket.upload(localPath, options);
    // Get public URL
    const file = bucket.file(destFileName);
    await file.makePublic();
    const publicUrl = `https://storage.googleapis.com/${bucketName}/${destFileName}`;
    console.log('Public URL:', publicUrl);
    return publicUrl;
  } catch (err) {
    console.error('Firebase upload error:', err);
    throw err;
  }
}

// Example usage:
const pdfPath = path.join(__dirname, 'Ebook Proposal.pdf');
uploadPDF(pdfPath, 'pdfs/mybook-firebase.pdf');
