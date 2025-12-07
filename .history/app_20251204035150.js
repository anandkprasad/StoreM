var express = require('express');
var path = require('path');
var app = express();

// Views
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

// Serve static files from `public` directory
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', function (req, res) {
    res.render('index');
});

var port = process.env.PORT || 3000;
app.listen(port, function () {
  console.log('App listening on port ' + port + '!');
});