// Dropbox setup for PDF uploads
// Dropbox setup for PDF uploads
// Proxy route for Dropbox PDF streaming (CORS-safe)
const requireAuth = (req, res, next) => {
  // Replace with real auth logic as needed
  if (!req.user) return res.status(401).send('Unauthorized');
  next();
};

app.get('/pdf/:id', requireAuth, async (req, res) => {
  try {
    const id = req.params.id; // e.g. "693101df095ae9fd19fea697.pdf"
    // Find Dropbox path from DB or construct from id
    const dropboxPath = `/store-pdfs/${id}`;
    const token = process.env.DROPBOX_ACCESS_TOKEN;
    if (!token) return res.status(500).send('Server misconfigured');
    const apiUrl = 'https://content.dropboxapi.com/2/files/download';
    const apiArgs = { path: dropboxPath };
    const resp = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Dropbox-API-Arg': JSON.stringify(apiArgs)
      }
    });
    if (!resp.ok) {
      const text = await resp.text().catch(()=>'<no-body>');
      console.error('Dropbox download error', resp.status, text);
      return res.status(502).send('Failed to retrieve file');
    }
    res.setHeader('Content-Type', 'application/pdf');
    resp.body.pipe(res);
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});
const Dropbox = require('dropbox').Dropbox;
const fetch = require('node-fetch');
const DROPBOX_ACCESS_TOKEN = process.env.DROPBOX_ACCESS_TOKEN || "sl.u.AGLyFVwDRVMDdMDJtLSol-KQV4vg9SiJFIVCZp3BDt1PDJpmSsXPINlQYtcXIi3FqYjN-NcEn0k_UXm-A7LlFuGGaBag4oBnzu4kwcAw7STNdvfnB2IxWP0Sy9-lqaJsdFnoitHSav5XeFkaSHRyiNzZUaguAVm1oXlB5k-7JgIvVw4duVvufmvI70kM6CooWajjtvoJfOIjCYgJ9BbMZVPCrdWCJkd4yJW1NEhcJ96wIFt_qJvTMwWPrW0etf605Lc4EACjA3K52DNtDJN4Tq-ZTtDyXBOMhuXWIW7--c1Ue5Lg7AkH7a2apmhc0C367RJ6SaCex6BJv_N12f3WuU6mOs0AOdZVJlANSqvYQ0iUO38fQs21UnPWhM-znqK8E6S_PRL9kz3adugSnOdBo3LTJc2Ine5BJijTZEsP_jjRTpyNtOb731kFDxsZczZN0FgJpktnOoy7bBRzSWr_269POeoqc-rK1NXgKyzHZKBT3q9UUHvYE7zg-aOg9sV9rUD4lKA2e1MlhDa-d5c8jB9cYL8gaUGKDMfM8hXhTj_vlF22b_wQGoZNgtIoH_iMhh-PX6_3cAwqhfI6o-omv6nx6mZPBSEDoXeNXl9oVSK12qA9bXBoZWrZ1HhHpq4uaY9M8xc9I0GE5FhexTeeJLIVpjp2fvzf9vqQopsuiRx5eYT0Ca2dO-yPlsgb-Pl2thykgpOeK8yGykHsK2xWnrTorSzj7LI_xuUDB727s2a1x7Upa5LJijMKUTSJ1SczLqPo0-cTCdLfzLnPzLeHMxlKS_ao4jjUx0bNuQ8-REQmbs5BRNNFhJhcuOIk3Sezk1mIyYdd63-R-E4rpeMHyhkYhp2_fGHyqdljNPx42HCnMuwv8_gnkErkuAJosb0gLNthdWChMBMDjE-GzbG6ditwKV8L4rjXTL14oikUYj-1WvuOa-ja3D71ktm-2gmcWi-BQb1CEnmdMfiM6VTIx6JXb7ht3KuphOZRm9aYDl41FCWWT3j89UFQ8WmW5rJoMkb8c-RDDkzFWB1KXVNObfvHgSrc3msJFx96VMAZbxzUwEJz7hFV6I1rS_4Le78aUZ9afrMMmD-cqkys8D-rRGgMPOjBEvujGXWUwDoArFnNsMc1E-FlAXL64JzzGocg6UUdQXXD9f00dJUB2UFM-MWf-9aNwCOlxmMsafRAXzqOyNWi8MP6I33bOr9_Aj-NQCg7209NGuvxxcZe8ufNP5ju1WjGqNNffuF08NsNJkgzxAlt2F5u2M8GemCPmJA-jCjrOyzTVpB0spIKoCnIapVFaRHinHDOXacnt-MZnA892Z69oQ6vAokqDY4duiPYIAaJqHGOse1jzU6EFpuLLQceJHoOYVJDRfgOO14gpjBPkV7bgWBCMAZrzXlM8yCuWA7S75L5if2Yq_FkUGNRVUSSr_gpx4ji4bfFMOd4BNS9xrfhkkmxpk2iHy-n86p_47w";
const dbx = new Dropbox({ accessToken: DROPBOX_ACCESS_TOKEN, fetch: fetch });
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

// Cloudinary Config
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

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

// PDF Processing Functions
// PDF upload now handled by Dropbox in admin route

// Convert a specific PDF page to image (on-demand)
// Note: Cloudinary converts PDF pages on-the-fly, so we'll use direct URL transformation
// and optionally cache the result
async function convertPDFPageToImage(pdfPublicId, pageNum, itemId) {
  return new Promise((resolve, reject) => {
    // Generate the transformed URL for this page
    const transformedUrl = cloudinary.url(pdfPublicId, {
      resource_type: 'image',
      format: 'jpg',
      page: pageNum,
      quality: 'auto:good',
      dpr: 'auto'
    });
    
    // Upload the transformed page as a cached image
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
          // If upload fails, the page might not exist - return null
          // But we can still use the transformed URL directly
          if (error.http_code === 404 || error.message.includes('404')) {
            resolve(null);
          } else {
            // Return the transformed URL even if upload fails (on-the-fly conversion)
            resolve(transformedUrl);
          }
        } else {
          resolve(result.secure_url);
        }
      }
    );
  });
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
      // Dropbox public URL is now used for viewer
      res.render('pdf-viewer', {
        pdfUrl: product.pdf_url,
        user: req.user,
        orderId: order._id
      });
      } catch (err) {
      if (req.flash) req.flash('error', 'Error loading PDF');
      res.redirect('/dashboard');
      }
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
    
    // If pages haven't been converted yet, convert them now
    if (!product.page_images || product.page_images.length === 0) {
      if (!product.pdf_url) {
        if (req.flash) {
          req.flash('error', 'PDF not available');
        }
        return res.redirect('/dashboard');
      }
      
      // Extract public_id from PDF URL
      const pdfMatch = product.pdf_url.match(/\/v\d+\/(.+)\.pdf/);
      if (!pdfMatch) {
        if (req.flash) {
          req.flash('error', 'Invalid PDF URL');
        }
        return res.redirect('/dashboard');
      }
      
      const pdfPublicId = pdfMatch[1];
      
      // Convert pages on-demand (try first 50 pages)
      const pageImages = [];
      for (let i = 1; i <= 50; i++) {
        try {
          const pageUrl = await convertPDFPageToImage(pdfPublicId, i, product._id.toString());
          // Check if the image URL is valid by making a HEAD request
          if (pageUrl) {
            const imageExists = await new Promise(resolve => {
              https.request(pageUrl, { method: 'HEAD' }, (resp) => {
                resolve(resp.statusCode === 200);
              }).on('error', () => resolve(false)).end();
            });
            if (imageExists) {
              pageImages.push(pageUrl);
            } else {
              break; // No more valid pages
            }
          } else {
            break; // No more pages
          }
        } catch (err) {
          break; // No more pages or error
        }
      }
      // Update product with converted pages (atomic update to avoid VersionError)
      await Item.findByIdAndUpdate(product._id, { $set: { page_images: pageImages } }, { new: true });

    }
    
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

    // Get watermarked image URL for this page
    // Extract public_id from the page image URL
    const pageImageUrl = product.page_images[pageNumber - 1];
    if (!pageImageUrl) {
      if (req.flash) {
        req.flash('error', 'Page image not found.');
      }
      return res.redirect(`/notes/${orderId}?token=${token}`);
    }
    const imageMatch = pageImageUrl.match(/\/v\d+\/(.+)\.(jpg|png|jpeg)/);
    const pageImagePublicId = imageMatch ? imageMatch[1] : pageImageUrl;

    const watermarkedUrl = getWatermarkedImageUrl(
      pageImagePublicId,
      req.user,
      orderId,
      req.headers.host
    );

    // Generate token for next/prev pages
    const nextToken = generateViewToken(
      req.user._id,
      req.user.email,
      orderId,
      30
    );

    res.render('viewer', {
      product: product,
      order: order,
      currentPage: pageNumber,
      totalPages: totalPages,
      imageUrl: watermarkedUrl,
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
    // Change sort field if you want a different ordering (e.g., { sortOrder: 1 })
    const items = await Item.find({})
      .sort({ createdAt: -1 }) // newest first; change as needed
      .limit(100)              // safety: don't load the entire DB if many items
      .lean();                 // optional: returns plain JS objects (faster)

    // Ensure we have an array
    const safeItems = Array.isArray(items) ? items : [];

    // Slice: first 2 on top, rest below
    const featuredItems = safeItems.slice(0, 2);
    const otherItems = safeItems.slice(2);

    res.render('index', { featuredItems, otherItems });
  } catch (err) {
    console.error('Error loading items for / :', err);
    res.render('index', { featuredItems: [], otherItems: [] });
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
      res.redirect('/dashboard');
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
    // Populate product details in orders
    await req.user.populate('orders.product');
    const items = await Item.find({});
    res.render('dashboard', { 
      items,
      currentUser: req.user
    });
  } catch (err) {
    console.error('Dashboard error:', err);
    res.render('dashboard', { 
      items: [],
      currentUser: req.user
    });
  }
});

// Admin Routes
app.get('/admin', isLoggedIn, isAdmin, function(req, res) {
  Item.find({}).then(function(items) {
    res.render('admin', { items: items });
  }).catch(function(err) {
    res.status(500).send('Error fetching items: ' + err.message);
  });
});

app.get('/admin/add', isLoggedIn, isAdmin, function(req, res) {
  res.render('admin-form', { item: null, action: 'add' });
});

app.post('/admin/add', isLoggedIn, isAdmin, upload.fields([
  { name: 'image', maxCount: 1 },
  { name: 'pdf', maxCount: 1 }
]), async function(req, res) {
  var name = req.body.name;
  var description = req.body.description;
  var price = req.body.price;
  var isDigital = req.body.is_digital === 'true';
  var imageUrl = '';
  var pdfUrl = '';
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

  // Process files
  const processFiles = async () => {
    // Upload image if provided
    if (req.files && req.files.image && req.files.image[0]) {
      return new Promise((resolve, reject) => {
        var imageFile = req.files.image[0];
        var imageStream = cloudinary.uploader.upload_stream(
          { folder: 'store-items' },
          async function(error, result) {
            if (error) {
              return reject(error);
            }
            imageUrl = result.secure_url;
            resolve();
          }
        );
        imageStream.end(imageFile.buffer);
      });
    }
    return Promise.resolve();
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
        const sharedUrl = await dbx.filesUpload({
          path: dropboxPath,
          contents: require('fs').readFileSync(tempPath),
          mode: 'overwrite',
          autorename: false,
          mute: false,
        }).then(() => dbx.sharingCreateSharedLinkWithSettings({ path: dropboxPath }))
         .then(res => {
           if (res && res.result && res.result.url) {
             return res.result.url.replace('?dl=0', '?raw=1');
           } else {
             console.error('Dropbox shared link response missing url:', res);
             throw new Error('Dropbox shared link response missing url');
           }
         });
        pdfUrl = sharedUrl;
        // Clean up temp file
        require('fs').unlinkSync(tempPath);
        pageImages = [];
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
  Item.findById(req.params.id, function(err, item) {
    if (err) {
      req.flash('error', 'Error fetching item: ' + err.message);
      res.redirect('/admin');
    } else {
      res.render('admin-form', { item: item, action: 'edit' });
    }
  });
});

app.post('/admin/edit/:id', isLoggedIn, isAdmin, upload.single('image'), function(req, res) {
  var name = req.body.name;
  var description = req.body.description;
  var price = req.body.price;
  var itemId = req.params.id;

  Item.findById(itemId, function(err, item) {
    if (err) {
      req.flash('error', 'Error fetching item: ' + err.message);
      res.redirect('/admin');
    } else {
      var imageUrl = item.image_url;

      function updateItem() {
        Item.findByIdAndUpdate(itemId, {
          name: name,
          description: description,
          price: parseFloat(price),
          image_url: imageUrl
        }, function(err) {
          if (err) {
            req.flash('error', 'Error updating item: ' + err.message);
            res.redirect('/admin');
          } else {
            req.flash('success', 'Item updated successfully!');
            res.redirect('/admin');
          }
        });
      }

      if (req.file) {
        var stream = cloudinary.uploader.upload_stream(
          { folder: 'store-items' },
          function(error, result) {
            if (error) {
              req.flash('error', 'Image upload failed: ' + error.message);
              res.redirect('/admin/edit/' + itemId);
            } else {
              imageUrl = result.secure_url;
              updateItem();
            }
          }
        );
        stream.end(req.file.buffer);
      } else {
        updateItem();
      }
    }
  });
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

var port = process.env.PORT || 3000;
app.listen(port, function() {
  console.log('App listening on port ' + port + '!');
});
