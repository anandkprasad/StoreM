
require('dotenv').config();

const fetch = require('node-fetch');
let dropboxAccessToken = process.env.DROPBOX_ACCESS_TOKEN;
const dropboxRefreshToken = process.env.DROPBOX_REFRESH_TOKEN;
const dropboxClientId = process.env.DROPBOX_CLIENT_ID;
const dropboxClientSecret = process.env.DROPBOX_CLIENT_SECRET;
const Dropbox = require('dropbox').Dropbox;

async function refreshDropboxToken() {
  if (!dropboxRefreshToken || !dropboxClientId || !dropboxClientSecret) {
    throw new Error('Dropbox refresh token, client ID, or client secret missing');
  }
  const resp = await fetch('https://api.dropbox.com/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: dropboxRefreshToken,
      client_id: dropboxClientId,
      client_secret: dropboxClientSecret
    })
  });
  if (!resp.ok) throw new Error('Failed to refresh Dropbox token');
  const data = await resp.json();
  dropboxAccessToken = data.access_token;
  return dropboxAccessToken;
}

async function getDropboxInstance() {
  // Always refresh the token before use
  dropboxAccessToken = await refreshDropboxToken();
  return new Dropbox({ accessToken: dropboxAccessToken, fetch });
}
const os = require('os');
var express = require('express');
var path = require('path');
var mongoose = require('mongoose');
var cloudinary = require('cloudinary').v2;
var multer = require('multer');
var passport = require('passport');
var LocalStrategy = require('passport-local');
var passportLocalMongoose = require('passport-local-mongoose');
// Handle possible ESM default export interop: require may return { default: fn }
var passportLocalMongooseFn = passportLocalMongoose && passportLocalMongoose.default ? passportLocalMongoose.default : passportLocalMongoose;
var session = require('express-session');
var flash = require('connect-flash');
var crypto = require('crypto');
var https = require('https');
var fs = require('fs');

var upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB max
});
require('dotenv').config();

var app = express();

// Dropbox setup for PDF uploads
// Dropbox setup for PDF uploads


// Robust /pdf/:id proxy route
// Secure proxy: serves /pdf/:productId.pdf only if logged-in user owns the order for that product
app.get('/pdf/:id', async (req, res) => {
  try {
    // Allow either a valid view token or a logged-in user session
    const token = req.query.token;
    let tokenData = null;
    if (token) tokenData = validateViewToken(token);

    if (!tokenData && !req.user) return res.status(401).send('Login required');

    const raw = req.params.id || '';
    const base = raw.replace(/\.pdf$/i, '');
    const filename = base + '.pdf';
    const dropboxPath = `/store-pdfs/${filename}`;

    // base should be the productId (ObjectId-like). Validate format:
    if (!/^[0-9a-fA-F]{24}$/.test(base)) {
      console.warn('[pdf proxy] Requested id is not a valid product ObjectId:', base);
      return res.status(400).send('Invalid file id');
    }

    // Authorization: if token provided, validate token refers to an order that contains this product
    if (tokenData) {
      try {
        // Find the user/order referenced by token and confirm the order contains this product
        const tokenUser = await User.findOne({ _id: tokenData.userId }).lean();
        if (!tokenUser) return res.status(403).send('Forbidden');
        const theOrder = (tokenUser.orders || []).find(o => String(o._id) === String(tokenData.orderId));
        if (!theOrder) return res.status(403).send('Forbidden');
        if (String(theOrder.product) !== String(base)) {
          console.warn('[pdf proxy] Token order/product mismatch', { orderId: tokenData.orderId, productRequested: base, productInOrder: theOrder.product });
          return res.status(403).send('Forbidden');
        }
        // authorized via token
      } catch (e) {
        console.error('[pdf proxy] Token authorization error', e);
        return res.status(403).send('Forbidden');
      }
    } else {
      // session-based authorization: Ensure the logged-in user actually purchased / owns this product
      const userId = req.user._id;
      const user = await User.findById(userId).lean(); // fresh copy from DB
      if (!user) return res.status(401).send('User session invalid');

      const owns = (user.orders || []).some(o => {
        return String(o.product) === String(base);
      });

      if (!owns) {
        console.warn(`[pdf proxy] User ${userId} attempted to access product ${base} but does not own it`);
        return res.status(403).send('Forbidden');
      }
    }

    // At this point: allowed. Try to stream file from Dropbox.

    // Try SDK download first (best effort)
    try {
      console.log('[pdf proxy] Attempting dbx.filesDownload for', dropboxPath);
      const dbx = await getDropboxInstance();
      const sdkResp = await dbx.filesDownload({ path: dropboxPath });
      const maybeBinary = sdkResp && (sdkResp.result ? sdkResp.result.fileBinary : sdkResp.fileBinary);
      if (maybeBinary) {
        const buffer = Buffer.isBuffer(maybeBinary) ? maybeBinary : Buffer.from(maybeBinary, 'binary');
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
        res.setHeader('Content-Length', buffer.length);
        return res.send(buffer);
      }
      console.log('[pdf proxy] filesDownload returned no binary; falling back to content API');
    } catch (sdkErr) {
      console.warn('[pdf proxy] filesDownload error (may be not_found):', sdkErr && (sdkErr.status || sdkErr.error || sdkErr));
    }

    // Fallback: content API stream
    const apiUrl = 'https://content.dropboxapi.com/2/files/download';
    // Ensure we have a fresh access token
    try {
      if (!dropboxAccessToken) {
        await refreshDropboxToken();
      }
    } catch (rtErr) {
      console.error('[pdf proxy] Failed to refresh Dropbox token:', rtErr);
    }
    const resp = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${dropboxAccessToken}`,
        'Dropbox-API-Arg': JSON.stringify({ path: dropboxPath })
      }
    });

    if (!resp.ok) {
      const bodyText = await resp.text().catch(()=>'<no-body>');
      console.error('[pdf proxy] Dropbox content API error', resp.status, bodyText);
      if (resp.status === 409) return res.status(404).send('File not found');
      return res.status(502).send('Failed to retrieve file from Dropbox');
    }

    // Stream the PDF to the client
    res.setHeader('Content-Type', resp.headers.get('content-type') || 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    if (resp.headers.get('content-length')) res.setHeader('Content-Length', resp.headers.get('content-length'));
    // optional CORS header (not necessary for same-origin)
    res.setHeader('Access-Control-Allow-Origin', '*');
    return resp.body.pipe(res);

  } catch (err) {
    console.error('[pdf proxy] Unexpected error:', err);
    return res.status(500).send('PDF proxy unexpected error');
  }
});



// Cloudinary Config
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// ==== Helper utilities to mirror test.js PDF → image conversion into ./out-pages ====
// Normalise Dropbox URLs so Cloudinary can reliably fetch them
function normalizeDropboxUrlForFetch(u) {
  if (!u) return u;
  if (!u.includes('dropbox.com')) return u;
  // Match the logic from test.js: prefer dl=1 and remove raw
  const base = u.split('?')[0];
  const params = new URLSearchParams(u.split('?')[1] || '');
  // prefer dl=1 for direct download
  params.set('dl', '1');
  // remove raw if present to avoid conflict
  params.delete('raw');
  return `${base}?${params.toString()}`;
}

// Generate a signed Cloudinary URL for a given PDF page (fetch remote PDF)
function generateSignedPageUrlForFetch(srcUrl, page, ttlSec = 300) {
  const expiresAt = Math.floor(Date.now() / 1000) + ttlSec;
  return cloudinary.url(srcUrl, {
    type: 'fetch',
    resource_type: 'image',
    page: page,
    format: 'jpg',
    quality: 'auto',
    dpr: 'auto',
    sign_url: true,
    expires_at: expiresAt
  });
}

async function ensureDir(dir) {
  await fs.promises.mkdir(dir, { recursive: true });
}

async function downloadToFile(url, outPath) {
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} ${res.statusText} - ${body}`);
  }
  await ensureDir(path.dirname(outPath));
  const dest = fs.createWriteStream(outPath);
  return new Promise((resolve, reject) => {
    res.body.pipe(dest);
    res.body.on('error', reject);
    dest.on('finish', resolve);
    dest.on('error', reject);
  });
}

// Convert a remote Dropbox PDF (stored in item.pdf_url) to local images under ./out-pages/<productId>
async function convertDropboxPdfToImagesLocal(pdfUrl, maxPages = 200, productId) {
  try {
    if (!pdfUrl) {
      console.warn('[pdf-images] No pdfUrl provided, skipping conversion');
      return;
    }

    const srcUrl = normalizeDropboxUrlForFetch(pdfUrl);
    const baseDir = path.resolve(process.cwd(), 'out-pages');
    const outDir = productId ? path.join(baseDir, String(productId)) : baseDir;

    console.log('[pdf-images] ENV DEBUG - Cloudinary API key:', process.env.CLOUDINARY_API_KEY);
    console.log('[pdf-images] ENV DEBUG - Dropbox token:', process.env.DROPBOX_ACCESS_TOKEN);
    console.log('[pdf-images] Source PDF URL:', srcUrl);
    console.log('[pdf-images] Output directory:', outDir);

    let downloaded = 0;
    let consecutiveFails = 0;
    const failThreshold = 3;

    for (let p = 1; p <= maxPages; ++p) {
      try {
        const fileName = `page-${String(p).padStart(3, '0')}.jpg`;
        const outPath = path.join(outDir, fileName);

        console.log(`[pdf-images] Fetching page ${p} -> ${outPath}`);
        const signed = generateSignedPageUrlForFetch(srcUrl, p, 300);
        console.log('[pdf-images][DEBUG] Cloudinary signed URL:', signed);

        await downloadToFile(signed, outPath);
        if (fs.existsSync(outPath)) {
          console.log(`[pdf-images] Saved page ${p}`);
        } else {
          console.error(`[pdf-images] File not saved: ${outPath}`);
        }
        downloaded++;
        consecutiveFails = 0;
      } catch (err) {
        console.error(`[pdf-images] Page ${p} fetch failed: ${err && err.message}`, err);
        consecutiveFails++;
        if (consecutiveFails >= failThreshold) {
          console.log(`[pdf-images] Stopping after ${consecutiveFails} consecutive failures.`);
          break;
        }
        await new Promise(r => setTimeout(r, 400));
      }
    }

    console.log(`[pdf-images] Done. Downloaded ${downloaded} pages (to ${outDir}).`);
  } catch (err) {
    console.error('[pdf-images] FATAL conversion error:', err);
  }
}

// Convert entire Dropbox-hosted PDF into Cloudinary images (pages)
// Returns array of page image URLs (Cloudinary secure urls)
async function convertDropboxPdfToCloudinaryPages(dropboxPdfUrl, itemId, maxPages = 300) {
  if (!dropboxPdfUrl) return [];
  const srcUrl = normalizeDropboxUrlForFetch(dropboxPdfUrl);
  console.log('[pdf-images] Starting conversion to Cloudinary pages for', itemId, 'src:', srcUrl);

  const results = [];
  let consecutiveFails = 0;
  const failThreshold = 6; // stop after this many missing pages in a row

  for (let p = 1; p <= maxPages; ++p) {
    try {
      const signed = generateSignedPageUrlForFetch(srcUrl, p, 300);
      console.log(`[pdf-images] Fetch URL for page ${p}:`, signed);

      // Upload the fetched page into Cloudinary to cache it and get a stable URL
      const uploadResult = await new Promise((resolve) => {
        cloudinary.uploader.upload(
          signed,
          {
            folder: `store-pages/${itemId}`,
            public_id: `page_${p}`,
            resource_type: 'image',
            type: 'fetch',
            overwrite: false,
            access_mode: 'authenticated'
          },
          (err, res) => {
            if (err) {
              console.warn(`[pdf-images] Cloudinary upload page ${p} error:`, err && err.message ? err.message : err);
              // If page doesn't exist (404) Cloudinary may surface an error — treat as null
              return resolve(null);
            }
            return resolve(res && res.secure_url ? res.secure_url : null);
          }
        );
      });

      if (uploadResult) {
        console.log(`[pdf-images] Uploaded page ${p} ->`, uploadResult);
        results.push(uploadResult);
        consecutiveFails = 0;
      } else {
        console.log(`[pdf-images] Page ${p} appears missing (no upload result)`);
        consecutiveFails++;
        if (consecutiveFails >= failThreshold) {
          console.log('[pdf-images] Stopping conversion after', consecutiveFails, 'consecutive missing pages');
          break;
        }
      }

      // small delay to avoid hitting remote rate limits
      await new Promise(r => setTimeout(r, 250));
    } catch (err) {
      console.error('[pdf-images] Unexpected error while converting page', p, err);
      consecutiveFails++;
      if (consecutiveFails >= failThreshold) break;
      await new Promise(r => setTimeout(r, 500));
    }
  }

  console.log('[pdf-images] Conversion finished. pages:', results.length);
  return results;
}

// Mongoose Connection
if (!process.env.MONGODB_URI) {
  console.error('MONGODB_URI is not set in .env');
  process.exit(1);
}
mongoose.connect(process.env.MONGODB_URI)
  .then(() => {
    console.log("Connected to MongoDB!");
  })
  .catch(err => {
    console.error("MongoDB connection failed:", err);
    process.exit(1);
  });

// User Schema
var orderSchema = new mongoose.Schema({
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Item' },
  amount: Number,
  paymentId: String,
  createdAt: { type: Date, default: Date.now }
});

var userSchema = new mongoose.Schema({
  username: String,
  password: String,
  type: Number,
  name: String,
  email: String,
  phone: String,
  address: String,
  orders: [orderSchema],
  createdAt: { type: Date, default: Date.now }
});
// Razorpay Setup
const Razorpay = require('razorpay');
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID || 'rzp_test_7XLmlaLyN7T96T',
  key_secret: process.env.RAZORPAY_KEY_SECRET || 'yyeblviLISvYS5dWJ13ReX77'
});

// Contact Message Schema
const contactMessageSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true },
  message: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});
const ContactMessage = mongoose.model('ContactMessage', contactMessageSchema);

// PDF Processing Functions
// PDF upload now handled by Dropbox in admin route

// Convert a specific PDF page to image (on-demand)
// Note: Cloudinary converts PDF pages on-the-fly, so we'll use direct URL transformation
// and optionally cache the result
async function convertPDFPageToImage(pdfPublicId, pageNum, itemId) {
  console.log('[PDF2IMG] Requested PDF page:', { pdfPublicId, pageNum, itemId });
  // Generate the transformed URL for this page
  const transformedUrl = cloudinary.url(pdfPublicId, {
    resource_type: 'image',
    format: 'jpg',
    page: pageNum,
    quality: 'auto:good',
    dpr: 'auto'
  });
  console.log('[PDF2IMG] Cloudinary transformedUrl:', transformedUrl);

  // Upload the transformed page as a cached image
  let uploadResult;
  try {
    uploadResult = await new Promise((resolve, reject) => {
      cloudinary.uploader.upload(
        transformedUrl,
        {
          folder: `store-pages/${itemId}`,
          public_id: `page_${pageNum}`,
          resource_type: 'image',
          type: 'fetch',
          access_mode: 'authenticated',
          overwrite: false
        },
        (error, result) => {
          if (error) {
            console.error('[PDF2IMG] Cloudinary upload error:', error);
            if (error.http_code === 404 || (error.message && error.message.includes('404'))) {
              resolve(null);
            } else {
              resolve(transformedUrl);
            }
          } else {
            console.log('[PDF2IMG] Cloudinary upload success:', result.secure_url);
            resolve(result.secure_url);
          }
        }
      );
    });
  } catch (err) {
    console.error('[PDF2IMG] Exception during Cloudinary upload:', err);
    uploadResult = null;
  }

  // Download the image to local out-pages directory if uploadResult is a URL
  if (uploadResult && typeof uploadResult === 'string' && uploadResult.startsWith('http')) {
    const outPagesDir = path.resolve(process.cwd(), 'out-pages');
    const productDir = path.join(outPagesDir, String(itemId));
    const fileName = `page-${String(pageNum).padStart(3, '0')}.jpg`;
    const outPath = path.join(productDir, fileName);
    try {
      console.log('[PDF2IMG] Downloading image to local path:', outPath, 'from', uploadResult);
      await downloadToFile(uploadResult, outPath);
      console.log('[PDF2IMG] Downloaded image to local path:', outPath);
    } catch (err) {
      console.error('[PDF2IMG] Failed to download image from Cloudinary to local out-pages:', err);
    }
  } else {
    console.error('[PDF2IMG] No valid uploadResult to download:', uploadResult);
  }
  return uploadResult;
}

// Token Generation and Validation
function generateViewToken(userId, userEmail, orderId, expiryMinutes = 15) {
  const payload = {
    userId: userId.toString(),
    userEmail: userEmail,
    orderId: orderId.toString(),
    expiry: Date.now() + (expiryMinutes * 60 * 1000),
    timestamp: Date.now()
  };
  
  const token = Buffer.from(JSON.stringify(payload)).toString('base64');
  const signature = crypto
    .createHmac('sha256', process.env.SESSION_SECRET || 'your-secret-key')
    .update(token)
    .digest('hex');
  
  return `${token}.${signature}`;
}

function validateViewToken(token) {
  try {
    const [payloadBase64, signature] = token.split('.');
    if (!payloadBase64 || !signature) {
      return null;
    }
    
    // Verify signature
    const expectedSignature = crypto
      .createHmac('sha256', process.env.SESSION_SECRET || 'your-secret-key')
      .update(payloadBase64)
      .digest('hex');
    
    if (signature !== expectedSignature) {
      return null;
    }
    
    // Decode payload
    const payload = JSON.parse(Buffer.from(payloadBase64, 'base64').toString());
    
    // Check expiry
    if (Date.now() > payload.expiry) {
      return null;
    }
    
    return payload;
  } catch (err) {
    return null;
  }
}

// Watermarking function - generates signed URL with watermark
function getWatermarkedImageUrl(imagePublicId, user, orderId, domain) {
  const timestamp = new Date().toLocaleString('en-US', { 
    year: 'numeric', 
    month: '2-digit', 
    day: '2-digit', 
    hour: '2-digit', 
    minute: '2-digit' 
  });
  
  const watermarkText1 = `${user.name} | ${user.email}`;
  const watermarkText2 = `Order: ${orderId} | ${timestamp}`;
  const watermarkText3 = domain || 'StoreM';
  
  // Extract public_id from URL if full URL is passed
  let publicId = imagePublicId;
  if (imagePublicId.includes('cloudinary.com')) {
    const match = imagePublicId.match(/\/v\d+\/(.+)\.(jpg|png|jpeg)/);
    if (match) publicId = match[1];
  }
  
  // Generate signed URL with watermark transformations
  return cloudinary.url(publicId, {
    resource_type: 'image',
    transformation: [
      // Diagonal watermark (repeated)
      {
        overlay: {
          text: `${watermarkText1} | ${watermarkText2} | ${watermarkText3}`,
          font_family: 'Arial',
          font_size: 24,
          font_weight: 'bold',
          opacity: 25,
          color: '#000000'
        },
        flags: 'relative',
        gravity: 'center',
        angle: -45,
        width: '100%',
        height: '100%'
      },
      // Bottom right watermark
      {
        overlay: {
          text: `${watermarkText1}\n${watermarkText2}\n${watermarkText3}`,
          font_family: 'Arial',
          font_size: 18,
          font_weight: 'bold',
          opacity: 40,
          color: '#000000'
        },
        flags: 'relative',
        gravity: 'south_east',
        y: 20,
        x: 20
      }
    ],
    sign_url: true, // Signed URL for private resources
    expires_at: Math.floor(Date.now() / 1000) + 1800 // 30 minutes expiry
  });
}

// Ensure the plugin passed is a function (supports CJS and ESM-default exports)
if (typeof passportLocalMongooseFn !== 'function') {
  console.error('passport-local-mongoose export is not a function. Received:', typeof passportLocalMongooseFn);
  console.error(passportLocalMongoose);
  process.exit(1);
}
userSchema.plugin(passportLocalMongooseFn);
var User = mongoose.model('User', userSchema);

// Item Schema
var itemSchema = new mongoose.Schema({
  name: String,
  description: String,
  price: Number,
  image_url: String,
  is_digital: { type: Boolean, default: false },
  pdf_url: String, // Original PDF in Cloudinary (private)
  page_images: [String], // Array of page image URLs from Cloudinary
  createdAt: { type: Date, default: Date.now }
});

var Item = mongoose.model('Item', itemSchema);

// Views
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

// Middleware
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Session & Passport
app.use(session({
  secret: process.env.SESSION_SECRET || 'your-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false, // Set to true if using HTTPS
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
    // Don't set sameSite - let browser default handle it for same-origin requests
  }
}));

app.use(passport.initialize());
app.use(passport.session());
app.use(flash());

// Serve generated page images from ./out-pages
app.use('/out-pages', express.static(path.join(__dirname, 'out-pages')));

// Cleanup route to delete generated page images for a specific order's product
// Called via navigator.sendBeacon from the PDF viewer on page close
app.post('/notes/:orderId/cleanup-pages', isLoggedIn, async (req, res) => {
  try {
    const { orderId } = req.params;
    await req.user.populate('orders.product');
    const order = req.user.orders.id(orderId);
    if (!order || !order.product) {
      return res.status(204).end();
    }
    const product = order.product;
    const productId = String(product._id || product);
    const baseDir = path.resolve(process.cwd(), 'out-pages');
    const targetDir = path.join(baseDir, productId);

    if (!fs.existsSync(targetDir)) {
      return res.status(204).end();
    }

    // Delete all files inside this product directory
    const files = await fs.promises.readdir(targetDir);
    await Promise.all(
      files.map(name =>
        fs.promises.unlink(path.join(targetDir, name)).catch(() => {})
      )
    );

    // Try to remove the empty directory (ignore errors)
    await fs.promises.rmdir(targetDir).catch(() => {});

    return res.status(204).end();
  } catch (err) {
    console.error('[notes/:orderId/cleanup-pages] cleanup error', err);
    return res.status(204).end(); // best-effort; don't surface error to client
  }
});

// Add isAuthenticated helper for Express 5.x compatibility
app.use(function(req, res, next) {
  req.isAuthenticated = function() {
    return !!req.user;
  };
  req.isUnauthenticated = function() {
    return !req.user;
  };
  next();
});

// Passport LocalStrategy configuration
passport.use(new LocalStrategy({
  usernameField: 'username',
  passwordField: 'password'
}, async function(username, password, done) {
  try {
    const user = await User.findOne({ username: username });
    if (!user) {
      console.log('User not found:', username);
      return done(null, false, { message: 'Incorrect username' });
    }
    // passport-local-mongoose v7+: authenticate returns { user, error }
    const result = await user.authenticate(password);
    if (result.error) {
      if (result.error.name === 'IncorrectPasswordError') {
        console.log('Invalid password for user:', username);
        return done(null, false, { message: 'Incorrect password' });
      } else {
        console.error('Authentication error:', result.error);
        return done(result.error);
      }
    }
    if (!result.user) {
      console.log('No user returned after authentication');
      return done(null, false, { message: 'Authentication failed' });
    }
    console.log('User authenticated successfully:', username);
    return done(null, result.user);
  } catch (err) {
    console.error('DB error during auth:', err);
    return done(err);
  }
}));

passport.serializeUser(User.serializeUser());
passport.deserializeUser(User.deserializeUser());

// Middleware to pass user to views
app.use(function(req, res, next) {
  res.locals.currentUser = req.user;
  res.locals.error = req.flash('error');
  res.locals.success = req.flash('success');
  next();
});

// Auth Middleware
function isLoggedIn(req, res, next) {
  if (req.user) {
    return next();
  }
  if (req.flash) {
    req.flash('error', 'Please log in first!');
  }
  res.redirect('/login');
}

function isAdmin(req, res, next) {
  if (req.user && req.user.type == 0) {
    return next();
  }
  if (req.flash) {
    req.flash('error', 'You need to be logged in as an admin to do that!');
  }
  res.redirect('/login');
}

// Payment Routes (must be after middleware setup)
app.get('/buy/:id', isLoggedIn, async function(req, res) {
  try {
    const product = await Item.findById(req.params.id);
    if (!product) {
      if (req.flash) {
        req.flash('error', 'Product not found');
      }
      return res.redirect('/');
    }
    const amount = Math.round(product.price * 100); // Razorpay expects paise
    const options = {
      amount,
      currency: 'INR',
      receipt: 'order_rcptid_' + Date.now(),
      payment_capture: 1
    };
    const order = await razorpay.orders.create(options);
    
    // Render a page that auto-opens Razorpay
    res.render('payment', {
      orderId: order.id,
      amount: order.amount,
      key: process.env.RAZORPAY_KEY_ID || 'rzp_test_7XLmlaLyN7T96T',
      product: product,
      user: req.user
    });
  } catch (err) {
    console.error('Razorpay error:', err);
    if (req.flash) {
      req.flash('error', 'Payment initiation failed');
    }
    res.redirect('/product/' + req.params.id);
  }
});

app.post('/payment/success', isLoggedIn, async function(req, res) {
  try {
    const { productId, paymentId, amount } = req.body;
    const product = await Item.findById(productId);
    if (!product) {
      if (req.flash) {
        req.flash('error', 'Product not found');
      }
      return res.redirect('/dashboard');
    }
    req.user.orders.push({ product: product._id, amount, paymentId });
    await req.user.save();
    if (req.flash) {
      req.flash('success', 'Payment successful! Order placed.');
    }
    res.redirect('/dashboard');
  } catch (err) {
    console.error('Order save error:', err);
    if (req.flash) {
      req.flash('error', 'Order save failed');
    }
    res.redirect('/dashboard');
  }
});

// Secure Digital Product Viewer Routes
app.get('/notes/:orderId', isLoggedIn, async function(req, res) {
  try {
    // Find the order
    const order = req.user.orders.id(req.params.orderId);
    if (!order) {
      if (req.flash) {
        req.flash('error', 'Order not found');
      }
      return res.redirect('/dashboard');
    }

    // Get the product
    await req.user.populate('orders.product');
    const product = order.product;
    
    if (!product || !product.is_digital) {
      if (req.flash) {
        req.flash('error', 'This is not a digital product');
      }
      return res.redirect('/dashboard');
    }

    // --- Ensure initial images are generated synchronously for this product ---
    const outPagesDir = path.resolve(process.cwd(), 'out-pages');
    const productDir = path.join(outPagesDir, String(product._id));
    const firstPagePath = path.join(productDir, 'page-001.jpg');
    // No eager conversion of all pages. Only generate requested page image on demand.

    // Generate access token
    const token = generateViewToken(
      req.user._id,
      req.user.email,
      order._id.toString(),
      30 // 30 minutes expiry
    );

    res.redirect(`/notes/${req.params.orderId}/page/1?token=${token}`);
  } catch (err) {
    console.error('Error accessing notes:', err);
    if (req.flash) {
      req.flash('error', 'Error accessing product');
    }
    res.redirect('/dashboard');
  }
});
    // Secure PDF.js Viewer Route
    app.get('/notes/:orderId/view', isLoggedIn, async function(req, res) {
      try {
      const order = req.user.orders.id(req.params.orderId);
      await req.user.populate('orders.product');
      const product = order.product;
      if (!product || !product.is_digital || !product.pdf_url) {
        if (req.flash) req.flash('error', 'PDF not available');
        return res.redirect('/dashboard');
      }
      // Guarantee images are generated for viewer (first 10 pages, at least page-001.jpg) for this product
      const outPagesDir = path.resolve(process.cwd(), 'out-pages');
      const productDir = path.join(outPagesDir, String(product._id));
      const firstPagePath = path.join(productDir, 'page-001.jpg');
      // No eager conversion of all pages. Only generate requested page image on demand.
      // Dropbox public URL is now used for viewer
      const viewToken = generateViewToken(
        req.user._id,
        req.user.email,
        order._id.toString(),
        30 // minutes
      );

      res.render('pdf-viewer', {
        productId: product._id,
        user: req.user,
        orderId: order._id,
        token: viewToken
      });



      } catch (err) {
      if (req.flash) req.flash('error', 'Error loading PDF');
      res.redirect('/dashboard');
      }
    });

    // Server-side search route
app.get('/search', async (req, res) => {
  const query = (req.query.q || '').trim();
  let results = [];
  let recommended = [];
  if (query) {
    results = await Item.find({
      $or: [
        { name: { $regex: query, $options: 'i' } },
        { description: { $regex: query, $options: 'i' } }
      ]
    }).lean();
  }
  // Optionally, recommend top 4 items (by price or any logic)
  recommended = await Item.find({}).sort({ price: -1 }).limit(4).lean();
  res.render('search', {
    query,
    results,
    recommended,
    currentUser: req.user
  });
});




app.get('/notes/:orderId/page/:pageNo', isLoggedIn, async function(req, res) {
  try {
    const { orderId, pageNo } = req.params;
    const token = req.query.token;

    // Validate token
    const tokenData = validateViewToken(token);
    if (!tokenData) {
      if (req.flash) {
        req.flash('error', 'Invalid or expired access token');
      }
      return res.redirect('/dashboard');
    }

    // Verify token matches current user and order
    if (tokenData.userId !== req.user._id.toString() || tokenData.orderId !== orderId) {
      if (req.flash) {
        req.flash('error', 'Unauthorized access');
      }
      return res.redirect('/dashboard');
    }

    // Find the order and product
    const order = req.user.orders.id(orderId);
    if (!order) {
      if (req.flash) {
        req.flash('error', 'Order not found');
      }
      return res.redirect('/dashboard');
    }

    await req.user.populate('orders.product');
    const product = order.product;
    
    if (!product || !product.is_digital) {
      if (req.flash) {
        req.flash('error', 'This is not a digital product');
      }
      return res.redirect('/dashboard');
    }

    const pageNumber = parseInt(pageNo);
    
    // No eager conversion of all pages. Only generate requested page image on demand.
    
    const totalPages = product.page_images.length;

    if (totalPages === 0) {
      if (req.flash) {
        req.flash('error', 'No pages available for this product.');
      }
      return res.redirect('/dashboard');
    }

    if (pageNumber < 1 || pageNumber > totalPages) {
      if (req.flash) {
        req.flash('error', 'Invalid page number');
      }
      return res.redirect(`/notes/${orderId}?token=${token}`);
    }

    // Ensure the requested page image exists under ./out-pages/<productId>
    const outPagesDir = path.resolve(process.cwd(), 'out-pages');
    const productDir = path.join(outPagesDir, String(product._id));
    const fileName = `page-${String(pageNumber).padStart(3, '0')}.jpg`;
    const pagePath = path.join(productDir, fileName);
    if (product.pdf_url && !fs.existsSync(pagePath)) {
      // Only convert the requested page for scalability
      console.log(`[notes/:orderId/page/:pageNo] For order ${orderId}, page ${pageNumber}: image not found for product ${product._id}, converting only requested page.`);
      // Use convertPDFPageToImage to generate just this page
      const pdfMatch = product.pdf_url.match(/\/v\d+\/(.+)\.pdf/);
      if (pdfMatch) {
        const pdfPublicId = pdfMatch[1];
        try {
          await convertPDFPageToImage(pdfPublicId, pageNumber, product._id.toString());
        } catch (err) {
          console.error('Error converting single PDF page:', err);
        }
      }
    }
    if (!fs.existsSync(pagePath)) {
      if (req.flash) {
        req.flash('error', 'Page image not found.');
      }
      return res.redirect(`/notes/${orderId}?token=${token}`);
    }
    // Serve the image via a static route or direct file URL
    const imageUrl = `/out-pages/${product._id}/${fileName}`;

    // Generate token for next/prev pages
    const nextToken = generateViewToken(
      req.user._id,
      req.user.email,
      orderId,
      30
    );

    res.render('pdf-viewer', {
      product: product,
      order: order,
      currentPage: pageNumber,
      totalPages: 0, // unknown, since we don't precompute
      imageUrl: imageUrl,
      token: nextToken,
      orderId: orderId
    });
  } catch (err) {
    console.error('Error viewing page:', err);
    if (req.flash) {
      req.flash('error', 'Error loading page');
    }
    res.redirect('/dashboard');
  }
});

app.get('/', async function (req, res) {
  try {
    // Fetch items in the desired order.
    const items = await Item.find({})
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();
    const safeItems = Array.isArray(items) ? items : [];
    const featuredItems = safeItems.slice(0, 2);
    const otherItems = safeItems.slice(2);
    res.render('index', {
      featuredItems,
      otherItems,
      success: req.flash('success'),
      error: req.flash('error')
    });
  } catch (err) {
    console.error('Error loading items for / :', err);
    res.render('index', {
      featuredItems: [],
      otherItems: [],
      success: req.flash('success'),
      error: req.flash('error')
    });
  }
});


// Auth Routes
app.get('/login', function(req, res) {
  res.render('login');
});

app.post('/login', function(req, res, next) {
  console.log("Login attempt:", req.body.username);
  console.log("Users in DB:", User.find({}));
  
  passport.authenticate('local', function(err, user, info) {
    console.log("Authenticate callback - err:", err, "user:", user, "info:", info);
    
    if (err) {
      console.error("Auth error:", err);
      return res.status(500).json({ error: err.message });
    }
    
    if (!user) {
      console.log("No user found");
      req.flash('error', info.message || 'Invalid username or password');
      return res.redirect('/login');
    }
    
    req.logIn(user, function(err) {
      if (err) {
        console.error("Login error:", err);
        return res.status(500).json({ error: err.message });
      }
      console.log("Login successful for:", user.username);
      req.flash('success', 'Logged in successfully!');
      res.redirect('/');
    });
  })(req, res, next);
});

app.get('/signup', function(req, res) {
  res.render('signup');
});

app.post('/signup', async function(req, res) {
  // Validate password match
  if (req.body.password !== req.body.confirmPassword) {
    req.flash('error', 'Passwords do not match!');
    return res.redirect('/signup');
  }

  var user = {
    username: req.body.username,
    name: req.body.name,
    email: req.body.email,
    phone: req.body.phone,
    address: req.body.address,
    type: 1
  };

  try {
    const registeredUser = await User.register(new User(user), req.body.password);
    req.login(registeredUser, function(err) {
      if (err) {
        console.error('Login after signup error:', err);
        req.flash('error', 'Signup succeeded but login failed. Please log in manually.');
        return res.redirect('/login');
      }
      req.flash('success', 'Account created successfully!');
      res.redirect('/dashboard');
    });
  } catch (err) {
    console.error('Registration error:', err);
    req.flash('error', err.message);
    res.redirect('/signup');
  }
});

app.get('/logout', function(req, res) {
  req.logOut(function(err) {
    if (err) {
      console.error('Logout error:', err);
      return res.status(500).send('Error logging out');
    }
    req.flash('success', 'Logged out successfully!');
    res.redirect('/');
  });
});

app.get('/dashboard', isLoggedIn, async function(req, res) {
  if (req.user.type == 0) {
    return res.redirect('/admin');
  }
  try {
    await req.user.populate('orders.product');
    const items = await Item.find({});
    res.render('dashboard', {
      items,
      currentUser: req.user,
      success: req.flash('success'),
      error: req.flash('error')
    });
  } catch (err) {
    console.error('Dashboard error:', err);
    res.render('dashboard', {
      items: [],
      currentUser: req.user,
      success: req.flash('success'),
      error: req.flash('error')
    });
  }
});

// Admin Routes
app.get('/admin', isLoggedIn, isAdmin, function(req, res) {
  const User = mongoose.model('User');
  const Item = mongoose.model('Item');
  Item.find({}).then(async function(items) {
    // Gather all orders from all users, populate product
    const users = await User.find({}).populate('orders.product').lean();
    let orders = [];
    users.forEach(user => {
      (user.orders || []).forEach(order => {
        let product = order.product || {};
        // If populated, product is object; else ObjectId
        let productName = product.name || product.title || product.toString();
        let productPrice = product.price || order.amount || 0;
        let productCost = product.cost || 0;
        orders.push({
          userName: user.username || user.name || 'Unknown',
          userEmail: user.email || '-',
          _id: order._id,
          productName,
          amount: order.amount || productPrice,
          cost: productCost,
          date: order.createdAt ? new Date(order.createdAt).toLocaleString() : '-',
        });
      });
    });
    const uniqueCustomers = new Set(orders.map(o => o.userEmail)).size;
    const totalRevenue = orders.reduce((sum, o) => sum + (Number(o.amount) || 0), 0);
    const totalCost = orders.reduce((sum, o) => sum + (Number(o.cost) || 0), 0);
    res.render('admin', {
      items: items,
      orderAnalytics: {
        totalOrders: orders.length,
        uniqueCustomers,
        totalRevenue,
        totalCost,
        grossProfit: totalRevenue - totalCost,
        orders
      }
    });
  }).catch(function(err) {
    res.status(500).send('Error fetching items: ' + err.message);
  });
});

app.get('/admin/add', isLoggedIn, isAdmin, function(req, res) {
  res.render('admin-form', { item: null, action: 'add' });
});

app.get("/admin/contacts", isLoggedIn, isAdmin, function(req, res) {
  ContactMessage.find({}).then(messages => {
    res.render("admin-contacts", { messages });
  }).catch(err => {
    console.error("Error fetching contact messages:", err);
    res.render("admin-contacts", { messages: [] });
  });
});

app.post('/admin/add', isLoggedIn, isAdmin, upload.fields([
  { name: 'images', maxCount: 10 },
  { name: 'image', maxCount: 1 },
  { name: 'pdf', maxCount: 1 }
]), async function(req, res) {
  var name = req.body.name;
  var description = req.body.description;
  var price = req.body.price;
  var isDigital = req.body.is_digital;
  var imageUrl = '';
  var pdfUrl = req.body.pdf_url || '';
  var pageImages = [];

  async function saveItem() {
    try {
      var newItem = new Item({
        name: name,
        description: description,
        price: parseFloat(price),
        image_url: imageUrl,
        is_digital: isDigital,
        pdf_url: pdfUrl,
        page_images: pageImages
      });
      await newItem.save();
      if (req.flash) {
        req.flash('success', 'Item added successfully!');
      }
      res.redirect('/admin');
    } catch (err) {
      if (req.flash) {
        req.flash('error', 'Error adding item: ' + err.message);
      }
      res.redirect('/admin/add');
    }
  }


// Single, robust /notes/:orderId/page/:pageNo/image route with only [PDF2IMG] and [notes image] logs
app.get('/notes/:orderId/page/:pageNo/image', async (req, res) => {
  try {
    const { orderId, pageNo } = req.params;
    const page = Math.max(1, parseInt(pageNo, 10) || 1);

    // Accept either token (query) or logged-in session
    const token = req.query.token;
    const tokenData = token ? validateViewToken(token) : null;

    if (!tokenData && !req.user) return res.status(401).json({ error: 'Login or token required' });

    // If session path, verify user owns the order; if token path, check token.orderId
    if (tokenData) {
      if (String(tokenData.orderId) !== String(orderId)) return res.status(403).json({ error: 'Token/order mismatch' });
    } else {
      // session: ensure current user owns the order
      await req.user.populate('orders.product');
      const order = req.user.orders.id(orderId);
      if (!order) return res.status(403).json({ error: 'Forbidden' });
      if (!order.product) return res.status(404).json({ error: 'Product missing' });
    }

    // Retrieve product and its pdf source URL (we stored Dropbox raw link in pdf_url)
    // If session, get product from user's order; otherwise find order in DB (token flow)
    let product;
    if (req.user && !tokenData) {
      const order = req.user.orders.id(orderId);
      product = await Item.findById(order.product).lean();
    } else {
      // token flow: find the order in DB and product
      const userWithOrder = await User.findOne({ 'orders._id': orderId }).populate('orders.product').lean();
      if (!userWithOrder) return res.status(404).json({ error: 'Order not found' });
      const theOrder = userWithOrder.orders.find(o => String(o._id) === String(orderId));
      if (!theOrder || !theOrder.product) return res.status(404).json({ error: 'Product not found' });
      product = theOrder.product;
    }

    if (!product || !product.pdf_url) return res.status(404).json({ error: 'PDF source missing' });

    // Build watermark text (per-user if session, or use token email if provided)
    const viewer = req.user || { name: tokenData?.userEmail || 'Guest', email: tokenData?.userEmail || '' };
    const watermarkText = `${viewer.name || viewer.email || 'Guest'} | Order: ${orderId}`;

    // Signed Cloudinary fetch URL for this page (short TTL)
    const expiresAt = Math.floor(Date.now() / 1000) + 300; // 5 minutes
    // normalize Dropbox share link to a direct-download/raw link Cloudinary can fetch
    // Use the same normalization function as the conversion utility
    const rawPdfUrl = normalizeDropboxUrlForFetch(product.pdf_url);

    // [notes image] log for debugging
    console.log('[notes image] rawPdfUrl used for fetch:', rawPdfUrl && rawPdfUrl.slice(0,200) + '...');

    const signedUrl = cloudinary.url(rawPdfUrl, {
      type: 'fetch',
      resource_type: 'image',
      page: Number(pageNo) || 1,
      format: 'jpg',
      quality: 'auto',
      dpr: 'auto',
      sign_url: true,
      expires_at: expiresAt,
      transformation: [
        {
          overlay: {
            text: watermarkText,
            font_family: 'Arial',
            font_size: 18,
            font_weight: 'bold',
            opacity: 40,
            color: '#000000'
          },
          gravity: 'south_east',
          x: 20,
          y: 20
        }
      ]
    });

    // Return JSON to client { url }
    return res.json({ url: signedUrl });
  } catch (err) {
    console.error('[notes image] error', err);
    return res.status(500).json({ error: 'Server error' });
  }
});


  // Process files (support multiple images) — ORDER SAFE
  const processFiles = async () => {
    // Collect candidates from both single 'image' and multi 'images' fields
    // Multer preserves the browser-selected order here
    const uploadedFiles = [];

    if (req.files) {
      if (Array.isArray(req.files.images) && req.files.images.length) {
        uploadedFiles.push(...req.files.images);
      }
      if (Array.isArray(req.files.image) && req.files.image.length) {
        uploadedFiles.push(...req.files.image);
      }
    }

    // Also support single-file fallback
    if (req.file && req.file.buffer) {
      uploadedFiles.push(req.file);
    }

    if (!uploadedFiles.length) return;

    pageImages = [];

    // ⬇️ UPLOAD SEQUENTIALLY TO PRESERVE ORDER
    for (const file of uploadedFiles) {
      const url = await new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          { folder: 'store-items' },
          (error, result) => {
            if (error) return reject(error);
            resolve(result.secure_url);
          }
        );
        uploadStream.end(file.buffer);
      });

      pageImages.push(url); // ✅ order preserved
    }

    // First image = cover image
    imageUrl = pageImages[0];
  };

  // Process PDF if digital product (Dropbox)
  const processPDF = async (itemId) => {
    if (isDigital && req.files && req.files.pdf && req.files.pdf[0]) {
      try {
        // Save PDF buffer to a temp file
        const pdfFile = req.files.pdf[0];
        const tempPath = path.join(os.tmpdir(), `pdf_${itemId}_${Date.now()}.pdf`);
        require('fs').writeFileSync(tempPath, pdfFile.buffer);
        // Upload to Dropbox
        const dropboxPath = `/store-pdfs/${itemId}.pdf`;
        const dbx = await getDropboxInstance();
        const uploadResp = await dbx.filesUpload({
          path: dropboxPath,
          contents: require('fs').readFileSync(tempPath),
          mode: 'overwrite',
          autorename: false,
          mute: false,
        });
        const linkResp = await dbx.sharingCreateSharedLinkWithSettings({ path: dropboxPath });
        let sharedUrl;
        if (linkResp && linkResp.result && linkResp.result.url) {
          sharedUrl = linkResp.result.url.replace('?dl=0', '?raw=1');
        } else {
          console.error('Dropbox shared link response missing url:', linkResp);
          throw new Error('Dropbox shared link response missing url');
        }
        pdfUrl = sharedUrl;
        // Clean up temp file
        require('fs').unlinkSync(tempPath);
        // Do not convert PDF to images at upload time; viewer will render PDF directly.
        // Preserve any page images uploaded via the admin form; do NOT reset `pageImages` here.
        // (Previously this code cleared `pageImages`, which removed uploaded image URLs.)
      } catch (pdfError) {
        console.error('PDF processing error:', pdfError);
        throw pdfError;
      }
    }
  };

  try {
    // First, save item to get ID (needed for PDF folder structure)
    var tempItem = new Item({
      name: name,
      description: description,
      price: parseFloat(price),
      image_url: '',
      is_digital: isDigital,
      pdf_url: '',
      page_images: []
    });
    await tempItem.save();
    const itemId = tempItem._id.toString();

    // Upload image
    await processFiles();

    // Process PDF
    await processPDF(itemId);

    // Update item with all URLs
    tempItem.image_url = imageUrl;
    tempItem.pdf_url = pdfUrl;
    tempItem.page_images = pageImages;
    await tempItem.save();

    if (req.flash) {
      req.flash('success', 'Item added successfully!');
    }
    res.redirect('/admin');
  } catch (err) {
    console.error('Error adding item:', err);
    if (req.flash) {
      req.flash('error', 'Error adding item: ' + err.message);
    }
    res.redirect('/admin/add');
  }
});

app.get('/admin/edit/:id', isLoggedIn, isAdmin, function(req, res) {
  (async () => {
    try {
      const item = await Item.findById(req.params.id);
      if (!item) {
        req.flash('error', 'Item not found');
        return res.redirect('/admin');
      }
      res.render('admin-form', { item: item, action: 'edit' });
    } catch (err) {
      req.flash('error', 'Error fetching item: ' + err.message);
      res.redirect('/admin');
    }
  })();
});

app.post('/admin/edit/:id', isLoggedIn, isAdmin, upload.fields([{ name: 'images', maxCount: 10 }, { name: 'image', maxCount: 1 }]), async (req, res) => {
  try {
    const itemId = req.params.id;
    const { name, description, price } = req.body;

    // fetch item correctly with await
    const item = await Item.findById(itemId);
    if (!item) {
      req.flash('error', 'Item not found');
      return res.redirect('/admin');
    }

    // default to existing image URL
    let imageUrl = item.image_url;

    // if new images were uploaded, accept both 'images' (multiple) and 'image' (single) and merge
    const uploadedFiles = [];
    if (req.files) {
      if (Array.isArray(req.files.images) && req.files.images.length) uploadedFiles.push(...req.files.images);
      if (Array.isArray(req.files.image) && req.files.image.length) uploadedFiles.push(...req.files.image);
      if (req.file && req.file.buffer) uploadedFiles.push(req.file);
    }

    if (uploadedFiles.length) {
      const uploadPromises = uploadedFiles.map(file => new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          { folder: 'store-items' },
          (error, result) => {
            if (error) return reject(error);
            resolve(result.secure_url);
          }
        );
        uploadStream.end(file.buffer);
      }));

      try {
        const urls = await Promise.all(uploadPromises);
        imageUrl = urls[0] || imageUrl;
        item.page_images = Array.isArray(item.page_images) ? item.page_images.concat(urls) : urls;
      } catch (err) {
        console.error('[admin/edit] image upload error', err);
        req.flash('error', 'Image upload failed');
        return res.redirect('/admin');
      }
    }

    // update item (returns the updated document if you want it)
    await Item.findByIdAndUpdate(
      itemId,
      {
        name,
        description,
        price: parseFloat(price),
        image_url: imageUrl
      },
      { new: true, runValidators: true }
    );

    req.flash('success', 'Item updated successfully!');
    return res.redirect('/admin');
  } catch (err) {
    // better error message
    req.flash('error', 'Error updating item: ' + (err.message || err));
    return res.redirect('/admin');
  }
});


app.get('/admin/delete/:id', isLoggedIn, isAdmin, function(req, res) {
  Item.findByIdAndDelete(req.params.id).then(function() {

      req.flash('success', 'Item deleted successfully!');
      res.redirect('/admin');
    
  }).catch(function(err) {
      req.flash('error', 'Error deleting item: ' + err.message);
      res.redirect('/admin');
  });
});


// Product Detail Route
app.get('/product/:id', async function(req, res) {
  try {
    const product = await Item.findById(req.params.id).lean();
    if (!product) {
      req.flash('error', 'Product not found');
      return res.redirect('/');
    }
    // Fetch recommended products (exclude current, sort by newest, limit 8)
    const recommended = await Item.find({ _id: { $ne: req.params.id } })
      .sort({ createdAt: -1 })
      .limit(2)
      .lean();
    res.render('product-detail', { product, recommended });
  } catch (err) {
    console.error('Error loading product detail:', err);
    req.flash('error', 'Error loading product detail');
    res.redirect('/');
  }
});

debugConversionURL = 'https://www.dropbox.com/scl/fi/fraizb3xwx6jcmd9307xq/693101df095ae9fd19fea697.pdf?rlkey=38p2ukkfqlrfcwfiv7itk4vob&e=2&dl=1';
// Contact page GET
app.get('/contact', (req, res) => {
  res.render('contact', {
    success: req.flash('success'),
    error: req.flash('error')
  });
});

// Contact form POST
app.post('/contact', async (req, res) => {
  const { name, email, message } = req.body;
  if (!name || !email || !message) {
    req.flash('error', 'All fields are required.');
    return res.redirect('/contact');
  }
  try {
    await ContactMessage.create({ name, email, message });
    req.flash('success', 'Thank you for contacting us! We will get back to you soon.');
  } catch (err) {
    req.flash('error', 'There was an error saving your message. Please try again.');
  }
  res.redirect('/contact');
});

// Newsletter form POST (index and dashboard)
app.post('/newsletter', async (req, res) => {
  const { name, email } = req.body;
  if (!email) {
    req.flash('error', 'Email is required for newsletter signup.');
    return res.redirect('back');
  }
  // Here you would store the email in DB or send to a newsletter service.
  req.flash('success', 'You have been subscribed to our newsletter!');
  res.redirect('back');
});


app.get("/terms", (req, res) => {
  res.render("terms");
}); 

app.get("/privacy", (req, res) => {
  res.render("privacy");
});

app.get("/refunds", (req, res) => {
  res.render("refunds");
});

app.get("/shipping", (req, res) => {
  res.render("shipping");
});

var port = process.env.PORT || 3000;
app.listen(port, function() {
  console.log('App listening on port ' + port + '!');
});

debugConversionURL = 'https://www.dropbox.com/scl/fi/fraizb3xwx6jcmd9307xq/693101df095ae9fd19fea697.pdf?rlkey=38p2ukkfqlrfcwfiv7itk4vob&e=2&dl=1';
app.get('/debug/convertpdf', async (req, res) => {
  const pdfUrl = req.query.url || debugConversionURL;
  if (!pdfUrl || pdfUrl === '<PUT_YOUR_DROPBOX_SHARED_PDF_URL_HERE>') {
    return res.status(400).send('No test PDF URL set. Edit the debugConversionURL variable or add ?url=...');
  }
  console.log('[DEBUG PDF CONVERSION] ENV:', process.env.CLOUDINARY_API_KEY, process.env.DROPBOX_ACCESS_TOKEN);
  try {
    // Use a fixed debug productId namespace so it doesn't collide with real products
    await convertDropboxPdfToImagesLocal(pdfUrl, 3, 'debug'); // Try with 3 pages
    res.send('Conversion triggered - check logs and out-pages.');
  } catch (err) {
    res.status(500).send('Conversion error: ' + err.message);
  }
});
