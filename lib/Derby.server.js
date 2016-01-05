var Derby = require('./Derby');
var util = require('racer/lib/util');

// Extend template types with html parsing on server
require('derby-parsing');

util.isProduction = process.env.NODE_ENV === 'production';

// DEPRECATED
Derby.prototype.run = function(createServer) {
  createServer();
};