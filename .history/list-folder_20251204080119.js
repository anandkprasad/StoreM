const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: 'andyishere3',
  api_key: '151564772698668',
  api_secret: 'JuisSxJyuR52o6Dw3H9Jx0tOKoI' // rotate after running
});

async function listFolder() {
  try {
    const res = await cloudinary.api.resources({
      resource_type: 'raw',
      type: 'upload',
      prefix: 'test-public/',
      max_results: 100
    });
    console.log(JSON.stringify(res, null, 2));
  } catch (err) {
    console.error('API error:', JSON.stringify(err, null, 2));
  }
}

listFolder();
