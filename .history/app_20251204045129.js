var express = require('express');
var path = require('path');
var mongoose = require('mongoose');
var cloudinary = require('cloudinary').v2;
var multer = require('multer');
var passport = require('passport');
var LocalStrategy = require('passport-local').Strategy;
var session = require('express-session');
var flash = require('connect-flash');
var bcrypt = require('bcryptjs');

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
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => {
  console.log("Connected to MongoDB!");
}).catch(err => {
  console.error("MongoDB connection failed:", err);
  process.exit(1);
});

// User Schema
var userSchema = new mongoose.Schema({
  username: { type: String, unique: true, required: true },
  password: String,
  type: { type: Number, default: 1 }, // 0 = admin, 1 = customer
  name: String,
  email: String,
  phone: String,
  address: String,
  createdAt: { type: Date, default: Date.now }
});

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

passport.use(new LocalStrategy({
  usernameField: 'username',
  passwordField: 'password'
}, async (username, password, done) => {
  try {
    const user = await User.findOne({ username: username });
    if (!user) {
      return done(null, false, { message: 'Incorrect username.' });
    }
    
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return done(null, false, { message: 'Incorrect password.' });
    }
    
    return done(null, user);
  } catch (err) {
    return done(err);
  }
}));

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (err) {
    done(err);
  }
});

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
  if (req.isAuthenticated() && req.user.type === 0) {
    return next();
  }
  req.flash('error', 'You need to be logged in as an admin to do that!');
  res.redirect('/login');
}

// Routes
app.get('/', function (req, res) {
  Item.find({}, function(err, items) {
    if (err) {
      res.render('index', { items: [] });
    } else {
      res.render('index', { items: items });
    }
  });
});

// Auth Routes
app.get('/login', function(req, res) {
  res.render('login');
});

app.post('/login', passport.authenticate('local', {
  successRedirect: '/dashboard',
  failureRedirect: '/login',
  failureFlash: true
}));

app.get('/signup', function(req, res) {
  res.render('signup');
});

app.post('/signup', async (req, res) => {
  try {
    // Check if user already exists
    const existingUser = await User.findOne({ username: req.body.username });
    if (existingUser) {
      req.flash('error', 'Username already exists!');
      return res.redirect('/signup');
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(req.body.password, 10);

    const user = new User({
      username: req.body.username,
      password: hashedPassword,
      name: req.body.name,
      email: req.body.email,
      phone: req.body.phone,
      address: req.body.address,
      type: 1 // Default to customer
    });

    await user.save();
    
    // Auto-login after signup
    req.logIn(user, (err) => {
      if (err) {
        req.flash('error', 'Error logging in!');
        return res.redirect('/signup');
      }
      req.flash('success', 'Account created successfully!');
      res.redirect('/dashboard');
    });
  } catch (err) {
    req.flash('error', err.message);
    res.redirect('/signup');
  }
});

app.get('/logout', function(req, res) {
  req.logOut(function(err) {
    if (err) {
      return next(err);
    }
    req.flash('success', 'Logged out successfully!');
    res.redirect('/');
  });
});

app.get('/dashboard', isLoggedIn, function(req, res) {
  if (req.user.type === 0) {
    // Admin dashboard
    res.redirect('/admin');
  } else {
    // Customer dashboard
    Item.find({}, function(err, items) {
      if (err) {
        res.render('dashboard', { items: [] });
      } else {
        res.render('dashboard', { items: items });
      }
    });
  }
});

// Admin Routes
app.get('/admin', isLoggedIn, isAdmin, async (req, res) => {
  try {
    const items = await Item.find({});
    res.render('admin', { items });
  } catch (err) {
    res.status(500).send('Error fetching items: ' + err.message);
  }
});

app.get('/admin/add', isLoggedIn, isAdmin, (req, res) => {
  res.render('admin-form', { item: null, action: 'add' });
});

app.post('/admin/add', isLoggedIn, isAdmin, upload.single('image'), async (req, res) => {
  try {
    const { name, description, price } = req.body;
    let imageUrl = '';

    if (req.file) {
      imageUrl = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { folder: 'store-items' },
          (error, result) => {
            if (error) reject(error);
            else resolve(result.secure_url);
          }
        );
        stream.end(req.file.buffer);
      });
    }

    const newItem = new Item({
      name,
      description,
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
});

app.get('/admin/edit/:id', isLoggedIn, isAdmin, async (req, res) => {
  try {
    const item = await Item.findById(req.params.id);
    res.render('admin-form', { item, action: 'edit' });
  } catch (err) {
    req.flash('error', 'Error fetching item: ' + err.message);
    res.redirect('/admin');
  }
});

app.post('/admin/edit/:id', isLoggedIn, isAdmin, upload.single('image'), async (req, res) => {
  try {
    const { name, description, price } = req.body;
    const existingItem = await Item.findById(req.params.id);
    let imageUrl = existingItem.image_url;

    if (req.file) {
      imageUrl = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { folder: 'store-items' },
          (error, result) => {
            if (error) reject(error);
            else resolve(result.secure_url);
          }
        );
        stream.end(req.file.buffer);
      });
    }

    await Item.findByIdAndUpdate(req.params.id, {
      name,
      description,
      price: parseFloat(price),
      image_url: imageUrl
    });

    req.flash('success', 'Item updated successfully!');
    res.redirect('/admin');
  } catch (err) {
    req.flash('error', 'Error updating item: ' + err.message);
    res.redirect('/admin');
  }
});

app.get('/admin/delete/:id', isLoggedIn, isAdmin, async (req, res) => {
  try {
    await Item.findByIdAndRemove(req.params.id);
    req.flash('success', 'Item deleted successfully!');
    res.redirect('/admin');
  } catch (err) {
    req.flash('error', 'Error deleting item: ' + err.message);
    res.redirect('/admin');
  }
});

var port = process.env.PORT || 3000;
app.listen(port, function() {
  console.log('App listening on port ' + port + '!');
});
