var express = require('express');
var path = require('path');
var { MongoClient, ServerApiVersion } = require('mongodb');

var app = express();

// MongoDB Connection
const uri = "mongodb+srv://admin:admin@ebookstoredb.jbwj4ca.mongodb.net/?appName=EBookStoreDB";
const mongoClient = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

// Views
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

// Serve static files from `public` directory
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', function (req, res) {
    res.render('index.ejs');
});

var port = process.env.PORT || 3000;

// Start server and connect to MongoDB
(async function() {
  try {
    await mongoClient.connect();
    await mongoClient.db("admin").command({ ping: 1 });
    console.log("Connected to MongoDB!");
    
    app.listen(port, function () {
      console.log('App listening on port ' + port + '!');
    });
  } catch (err) {
    console.error("MongoDB connection failed:", err);
    process.exit(1);
  }
})();
