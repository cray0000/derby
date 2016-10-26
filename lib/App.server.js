/*
 * App.server.js
 *
 * Application level functionality that is
 * only applicable to the server.
 *
 */

var fs = require('fs');
var path = require('path');
var racer = require('racer');
var util = racer.util;
var App = require('./App');

var PROJECT_PATH = process.env.PROJECT_PATH || process.cwd();
var BUILD_CLIENT_PATH = process.env.BUILD_CLIENT_PATH || '/build/client/';

App.prototype._init = function() {
  this.scriptUrl = this._getResourcePath('bundle');
  this.agents = null;
  this._loadBaseViews();
  if (process.env.NODE_ENV === 'production' && this.name) this._loadProductionStyles();
};

App.prototype.createPage = function(req, res, next) {
  var model = req.model || new racer.Model();
  this.emit('model', model);
  var page = new this.Page(this, model, req, res);
  if (next) {
    model.on('error', function(err){
      model.hasErrored = true;
      next(err);
    });
    page.on('error', next);
  }
  return page;
};

App.prototype._getResourcePath = function(type) {
  var prefix = '', url = 'ERROR_EMPTY', postfix = '';
  switch (type) {
    case 'bundle':
      if (process.env.NODE_ENV === 'production') {
        postfix = '.' + this._getHash(this.name, type);
      } else {
        prefix = process.env.DEVSERVER_URL ||
            ('http://localhost:' + (process.env.DEVSERVER_PORT || 3010));
      }
      url = prefix + BUILD_CLIENT_PATH + this.name + postfix + '.js';
      break;
    case 'style':
      url = BUILD_CLIENT_PATH + this.name + '.css';
      break;
    default:
      throw new Error('No resource found for \'' + type + '\'');
      break;
  }
  return url;
};

// Get assets hashes in production (used for long term caching)
App.prototype._getHash = function(name, type) {
  if (process.env.NODE_ENV !== 'production') return;
  if (!name) return '';
  var assetsMeta, hash = '';
  var assetsMetaPath = path.join(PROJECT_PATH, BUILD_CLIENT_PATH, 'assets.json');
  try {
    assetsMeta = require(assetsMetaPath);
  } catch (e) {
    throw new Error('Error loading assets meta file at: ' + assetsMetaPath);
  }
  switch (type) {
    case 'bundle':
      hash = assetsMeta && assetsMeta[name] && assetsMeta[name].js;
      if (!hash) {
        throw new Error('No hash found for \'' + name + '\' ' + type + ' in ' + assetsMetaPath);
      }
      hash = hash.match(/\.([^\.]+)\.js$/);
      hash && (hash = hash[1]);
      if (!hash) {
        throw new Error('No hash in bundle filename. Filename should be in the following format: \'[name].[hash].js\'');
      }
      break;
    default:
      throw new Error('No hash exists for assets of type \'' + type + '\'');
      break;
  }
  return hash;
};

App.prototype._loadProductionStyles = function() {
  var styleRelPath = this._getResourcePath('style');
  var stylePath = path.join(PROJECT_PATH, styleRelPath);
  if (!fs.existsSync(stylePath)) {
    console.error('No stylesheets found for \'' + this.name +
        '\' at path: ' + stylePath);
    return;
  }
  var style = fs.readFileSync(stylePath, {encoding: 'utf8'});
  var source = '<style>' + style + '</style>';
  this.views.register(styleRelPath, source, {serverOnly: true});

  var stylesView = this.views.find('Styles');
  stylesView.source += '<view is="' + styleRelPath + '"></view>';
};