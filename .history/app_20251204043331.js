var express = require('express');
var path = require('path');
var { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
var cloudinary = require('cloudinary').v2;
var multer = require('multer');
var upload = multer({ storage: multer.memoryStorage() });
require('dotenv').config();

var app = express();

// Cloudinary Config
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// MongoDB Connection
const uri = process.env.MONGODB_URI || "mongodb+srv://admin:admin@ebookstoredb.jbwj4ca.mongodb.net/?appName=EBookStoreDB";
const mongoClient = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

let db;
let itemsCollection;

// Views
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

// Middleware
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.get('/', function (req, res) {
    res.render('index.ejs');
});

// Admin Routes
app.get('/admin', async (req, res) => {
    try {
        const items = await itemsCollection.find({}).toArray();
        res.render('admin', { items });
    } catch (err) {
        res.status(500).send('Error fetching items: ' + err.message);
    }
});

app.get('/admin/add', (req, res) => {
    res.render('admin-form', { item: null, action: 'add' });
});

app.post('/admin/add', upload.single('image'), async (req, res) => {
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

        const newItem = { name, description, price: parseFloat(price), image_url: imageUrl };
        await itemsCollection.insertOne(newItem);
        res.redirect('/admin');
    } catch (err) {
        res.status(500).send('Error adding item: ' + err.message);
    }
});

app.get('/admin/edit/:id', async (req, res) => {
    try {
        const item = await itemsCollection.findOne({ _id: new ObjectId(req.params.id) });
        res.render('admin-form', { item, action: 'edit' });
    } catch (err) {
        res.status(500).send('Error fetching item: ' + err.message);
    }
});

app.post('/admin/edit/:id', upload.single('image'), async (req, res) => {
    try {
        const { name, description, price } = req.body;
        const itemId = new ObjectId(req.params.id);
        const existingItem = await itemsCollection.findOne({ _id: itemId });
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

        await itemsCollection.updateOne(
            { _id: itemId },
            { $set: { name, description, price: parseFloat(price), image_url: imageUrl } }
        );
        res.redirect('/admin');
    } catch (err) {
        res.status(500).send('Error updating item: ' + err.message);
    }
});

app.get('/admin/delete/:id', async (req, res) => {
    try {
        await itemsCollection.deleteOne({ _id: new ObjectId(req.params.id) });
        res.redirect('/admin');
    } catch (err) {
        res.status(500).send('Error deleting item: ' + err.message);
    }
});

var port = process.env.PORT || 3000;

// Start server and connect to MongoDB
(async function() {
  try {
    await mongoClient.connect();
    await mongoClient.db("admin").command({ ping: 1 });
    console.log("Connected to MongoDB!");
    
    db = mongoClient.db("EBookStoreDB");
    itemsCollection = db.collection("items");
    
    app.listen(port, function () {
      console.log('App listening on port ' + port + '!');
    });
  } catch (err) {
    console.error("MongoDB connection failed or failed to start server!", err);
    process.exit(1);
  }
})();

// Graceful shutdown
process.on('SIGINT', async function() {
  console.log('Shutting down...');
  await mongoClient.close();
  process.exit(0);
});
