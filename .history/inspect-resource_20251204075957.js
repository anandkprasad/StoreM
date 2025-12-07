const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: 'andyishere3',
  api_key: '151564772698668',
  api_secret: 'JuisSxJyuR52o6Dw3H9Jx0tOKoI' // rotate after running
});

async function inspect() {
  try {
    const publicId = 'test-public/mybook-fresh-v1'; // no .pdf
    const res = await cloudinary.api.resource(publicId, { resource_type: 'raw', type: 'upload' });
    console.log(JSON.stringify(res, null, 2));
  } catch (err) {
    console.error('API error:', err);
  }
}

inspect();
