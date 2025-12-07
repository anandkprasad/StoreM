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

var upload = multer({ storage: multer.memoryStorage() });
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
// Payment Route
app.post('/buy/:id', isLoggedIn, async function(req, res) {
  try {
    const product = await Item.findById(req.params.id);
    if (!product) {
      req.flash('error', 'Product not found');
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
    res.json({ orderId: order.id, amount: order.amount, key: process.env.RAZORPAY_KEY_ID, product });
  } catch (err) {
    console.error('Razorpay error:', err);
    res.status(500).json({ error: 'Payment initiation failed' });
  }
});

// Payment Success Callback
app.post('/payment/success', isLoggedIn, async function(req, res) {
  try {
    const { productId, paymentId, amount } = req.body;
    const product = await Item.findById(productId);
    if (!product) {
      return res.status(400).json({ error: 'Product not found' });
    }
    req.user.orders.push({ product: product._id, amount, paymentId });
    await req.user.save();
    res.json({ success: true });
  } catch (err) {
    console.error('Order save error:', err);
    res.status(500).json({ error: 'Order save failed' });
  }
});

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
  saveUninitialized: false
}));

app.use(passport.initialize());
app.use(passport.session());
app.use(flash());

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
  if (req.isAuthenticated()) {
    return next();
  }
  req.flash('error', 'Please log in first!');
  res.redirect('/login');
}

function isAdmin(req, res, next) {
  if (req.isAuthenticated() && req.user.type == 0) {
    return next();
  }
  req.flash('error', 'You need to be logged in as an admin to do that!');
  res.redirect('/login');
}

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
    res.render('dashboard', { items });
  } catch (err) {
    res.render('dashboard', { items: [] });
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

app.post('/admin/add', isLoggedIn, isAdmin, upload.single('image'), function(req, res) {
  var name = req.body.name;
  var description = req.body.description;
  var price = req.body.price;
  var imageUrl = '';

  async function saveItem() {
    try {
      var newItem = new Item({
        name: name,
        description: description,
        price: parseFloat(price),
        image_url: imageUrl
      });
      await newItem.save();
      req.flash('success', 'Item added successfully!');
      res.redirect('/admin');
    } catch (err) {
      req.flash('error', 'Error adding item: ' + err.message);
      res.redirect('/admin/add');
    }
  }

  if (req.file) {
    var stream = cloudinary.uploader.upload_stream(
      { folder: 'store-items' },
      async function(error, result) {
        if (error) {
          req.flash('error', 'Image upload failed: ' + error.message);
          res.redirect('/admin/add');
        } else {
          imageUrl = result.secure_url;
          await saveItem();
        }
      }
    );
    stream.end(req.file.buffer);
  } else {
    saveItem();
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
  Item.findByIdAndDelete(req.params.id, function(err) {
    if (err) {
      req.flash('error', 'Error deleting item: ' + err.message);
      res.redirect('/admin');
    } else {
      req.flash('success', 'Item deleted successfully!');
      res.redirect('/admin');
    }
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
