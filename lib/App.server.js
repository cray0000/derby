/*
 * App.server.js
 *
 * Application level functionality that is
 * only applicable to the server.
 *
 */

var racer = require('racer');
var util = racer.util;
var App = require('./App');

App.prototype._init = function() {
  this.scriptUrl = this._getResourcePath('bundle');
  this.clients = null;
  this._loadBaseViews();
  if (process.env.NODE_ENV === 'production') this._loadProductionStyles();
};

App.prototype.createPage = function(req, res, next) {
  var model = (req.getModel) ? req.getModel() : new racer.Model();
  if (!model) return;
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
  var BUILD_CLIENT_PATH = process.env.BUILD_CLIENT_PATH || '/build/client/';
  var prefix = '', url = '';
  switch (type) {
    case 'bundle':
      if (process.env.NODE_ENV !== 'production') {
        prefix = process.env.DEVSERVER_URL ||
            ('http://localhost:' + (process.env.DEVSERVER_PORT || 3010));
      }
      url = prefix + BUILD_CLIENT_PATH + this.name + '.js';
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

App.prototype._loadProductionStyles = function() {
  var projectPath = process.env.PROJECT_PATH || process.cwd();
  var styleRelPath = this._getResourcePath('style');
  var stylePath = path.join(projectPath, styleRelPath);
  if (!fs.existsSync(stylePath)) {
    console.error('No stylesheets found for \'' + this.name +
        '\' at path: ' + stylePath);
    return;
  }
  var style = fs.readFileSync(stylePath, {encoding: 'utf8'});
  var source = '<style>' + style + '</style>';
  this.views.register(styleRelPath, source, {serverOnly: true});

  var stylesView = this.views.find('Styles');
  stylesView.source += '<view name="' + styleRelPath + '"></view>';
};