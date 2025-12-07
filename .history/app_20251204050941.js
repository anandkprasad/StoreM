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
var userSchema = new mongoose.Schema({
  username: String,
  password: String,
  type: Number,
  name: String,
  email: String,
  phone: String,
  address: String,
  createdAt: { type: Date, default: Date.now }
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

passport.use(User.createStrategy());
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

// Routes
app.get('/', function (req, res) {
  Item.find({}).then(function(items) {
    res.render('index', { items: items });
  }).catch(function(err) {
    res.render('index', { items: [] });
  });
});

// Auth Routes
app.get('/login', function(req, res) {
  res.render('login');
});

app.post('/login', function(req, res, next) {
  passport.authenticate('local', {
    successRedirect: '/dashboard',
    failureRedirect: '/login',
    failureFlash: true
  })(req, res, next);
});

app.get('/signup', function(req, res) {
  res.render('signup');
});

app.post('/signup', function(req, res) {
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

  User.register(new User(user), req.body.password, function(err, user) {
    if (err) {
      console.error('Registration error:', err);
      req.flash('error', err.message);
      return res.redirect('/signup');
    } else {
      passport.authenticate('local')(req, res, function() {
        req.flash('success', 'Account created successfully!');
        res.redirect('/dashboard');
      });
    }
  });
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

app.get('/dashboard', isLoggedIn, function(req, res) {
  if (req.user.type == 0) {
    res.redirect('/admin');
  } else {
    Item.find({}).then(function(items) {
      res.render('dashboard', { items: items });
    }).catch(function(err) {
      res.render('dashboard', { items: [] });
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

app.post('/admin/add', isLoggedIn, isAdmin, upload.single('image'), function(req, res) {
  var name = req.body.name;
  var description = req.body.description;
  var price = req.body.price;
  var imageUrl = '';

  function saveItem() {
    var newItem = new Item({
      name: name,
      description: description,
      price: parseFloat(price),
      image_url: imageUrl
    });

    newItem.save(function(err) {
      if (err) {
        req.flash('error', 'Error adding item: ' + err.message);
        res.redirect('/admin/add');
      } else {
        req.flash('success', 'Item added successfully!');
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
          res.redirect('/admin/add');
        } else {
          imageUrl = result.secure_url;
          saveItem();
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

var port = process.env.PORT || 3000;
app.listen(port, function() {
  console.log('App listening on port ' + port + '!');
});
