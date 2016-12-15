/*
 * components.js
 *
 * Components associate custom script functionality with a view. They can be
 * distributed as standalone modules containing templates, scripts, and styles.
 * They can also be used to modularize application functionality.
 *
 */

var path = require('path');
var util = require('racer/lib/util');
var derbyTemplates = require('derby-templates');
var templates = derbyTemplates.templates;
var expressions = derbyTemplates.expressions;
var App = require('./App');
var Controller = require('./Controller');

exports.Component = Component;
exports.ComponentFactory = ComponentFactory;
exports.SingletonComponentFactory = SingletonComponentFactory;
exports.createFactory = createFactory;

templates.ComponentMarker.prototype.emit = function(context, node) {
  node.$component = context.controller;
  context.controller.markerNode = node;
  bindIndividualAttributes(context, node);
  bindObjectAttributes(context, node);
};

function isPlainObject(obj){
  return (Object.prototype.toString.call(obj) === "[object Object]")
}

function bindIndividualAttributes(context, node){
  var parentContext = context.parent;
  var component = context.controller;
  if (!component._attributeList) return;
  component._attributeList.forEach(function(key){
    var attribute = parentContext.attributes[key];
    var comonentAttribute = new ComponentAttribute(context.controller, key, attribute);
    comonentAttribute.getBound(parentContext, node);
    component.model.on('change', key, function(value, oldValue){
      if (key === 'id') return;
      if (!attribute.expression) return;
      if (!attribute.expression.set) return;
      if (value !== oldValue) {
        try {
          attribute.expression.set(context, value);
        } catch(err) {}
      }
    });
  })
}

function bindObjectAttributes(context, node){
  var parentContext = context.parent;
  var component = context.controller;
  if (!parentContext.attributes) return
  var attributes = parentContext.attributes['attributes'];
  if (!attributes) return;
  var attributesMeta = component._attributesMeta;

  if(attributesMeta.type === 'literal') return;
  var comonentAttribute = new ComponentAttributes(context.controller, attributes.expression || attributes.template);
  comonentAttribute.getBound(parentContext, node);
}

function ComponentAttributes(component, expression) {
  this.component = component;
  this.expression = expression;
  this.expression.supportObject = true;

  this.name = 'attributes';
  this.attributeType = component._attributesMeta.type;
  this._meta = component._attributesMeta;
  this.model = component.model;
}

ComponentAttributes.prototype = new templates.Attribute();
ComponentAttributes.prototype.getBound = function(context, element) {
  context.addBinding(new templates.AttributeBinding(this, context, element, 'attributes'));
};

ComponentAttributes.prototype.update = function(context, binding) {
  var newValue = getUnescapedValue(this.expression, context);

  if (this.attributeType === 'ref') {
    this.updateRef(newValue, context);
  } else {
    this.updateExp(newValue, context);
  }
};

ComponentAttributes.prototype.updateRef = function(newValue, context){
  var model = this.model;
  var newValues = {};
  var newValueIsObject = isPlainObject(newValue);
  var segments = this.expression.pathSegments(context);
  var force = !util.deepEqual(segments, this._meta.segments);

  // REMOVE

  // new: obj, old: field
  if (newValueIsObject && !this._meta.oldValueIsObject){
    // unref 'attributes' ref
    model.root.removeRef(model.at + '.attributes');
  }
  // new: field, old: obj
  if (!newValueIsObject && this._meta.oldValueIsObject){
    for(var key in this._meta.oldValues) {
      model.root.removeRef(model.at + '.' + key);
    }
  }
  // new: obj, old: obj
  if (newValueIsObject && this._meta.oldValueIsObject){
    for(var key in this._meta.oldValues) {
      if (key in newValue && !force) continue;
      model.root.removeRef(model.at + '.' + key);
    }
  }

  // ADD

  if (newValueIsObject){
    for(var key in newValue) {
      if (key in context.attributes) continue;
      newValues[key] = true;
      if (key in this._meta.oldValues && !force) continue;
      refAttribute(model, key, segments.join('.') + '.' + key);
    }
    this._meta.oldValueIsObject = true
    this._meta.oldValues = newValues;
  } else {
    this._meta.oldValues = undefined;
    refAttribute(model, 'attributes', segments.join('.'));
    this._meta.oldValueIsObject = false
  }

  this._meta.segments = segments;
}

ComponentAttributes.prototype.updateExp = function(newValue, context){
  var model = this.model;
  var newValues = {};
  var newValueIsObject = isPlainObject(newValue);

  // REMOVE

  // new: obj, old: field
  if (newValueIsObject && !this._meta.oldValueIsObject){
    model.del('attributes');
  }
  // new: field, old: obj
  if (!newValueIsObject && this._meta.oldValueIsObject){
    for(var key in this._meta.oldValues) model.del(key);
  }
  // new: obj, old: obj
  if (newValueIsObject && this._meta.oldValueIsObject){
    for(var key in this._meta.oldValues) {
      if (key in newValue) continue;
      model.del(key);
    }
  }

  // ADD

  if (newValueIsObject){
    for(var key in newValue) {
      if (key in context.attributes) continue;
      newValues[key] = true;
      if (!util.deepEqual(model.get(key), newValue[key])) {
        model.setDiffDeep(key, util.deepCopy(newValue[key]));
      }
    }
    this._meta.oldValueIsObject = true
    this._meta.oldValues = newValues;
  } else {
    this._meta.oldValues = undefined;

    if (!util.deepEqual(model.get('attributes'), newValue)) {
      model.setDiffDeep('attributes', util.deepCopy(newValue));
    }

    this._meta.oldValueIsObject = false
  }
}

function ComponentAttribute(component, name, expression) {
  this.component = component;
  this.name = name;
  this.expression = expression;
  this.model = component.model;
}

ComponentAttribute.prototype = new templates.Attribute();
ComponentAttribute.prototype.getBound = function(context, element) {
  context.addBinding(new templates.AttributeBinding(this, context, element, this.name));
};

ComponentAttribute.prototype.update = function(context, binding) {
  var value = getUnescapedValue(this.expression, context);
  if (!util.deepEqual(value, this.model.get(this.name))) {
    this.model.setDiffDeep(this.name, util.deepCopy(value));
  }
};

function getUnescapedValue(expression, context) {
  var unescaped = true;
  var value = expression.get(context, unescaped);
  while (value instanceof templates.Template) {
    value = value.get(context, unescaped);
  }
  return value;
}


function Component(parent, context, id, scope) {
  this.parent = parent;
  this.context = context;
  this.id = id;
  this._scope = scope;
}

util.mergeInto(Component.prototype, Controller.prototype);

Component.prototype.destroy = function() {
  this.emit('destroy');
  this.model.removeContextListeners();
  this.model.destroy();
  delete this.page._components[this.id];
  var components = this.page._eventModel.object.$components;
  if (components) delete components.object[this.id];
};

Component.prototype.get = function(viewName, unescaped) {
  var view = this.getView(viewName);
  return view.get(this.context, unescaped);
};

Component.prototype.getFragment = function(viewName) {
  var view = this.getView(viewName);
  return view.getFragment(this.context);
};

Component.prototype.getView = function(viewName) {
  var contextView = this.context.getView();
  return (viewName) ?
    this.app.views.find(viewName, contextView.namespace) : contextView;
};

Component.prototype.getAttribute = function(key) {
  var attributeContext = this.context.forAttribute(key);
  if (!attributeContext) return;
  var value = attributeContext.attributes[key];
  return value && expressions.renderValue(value, attributeContext);
};

Component.prototype.setAttribute = function(key, value) {
  this.context.parent.attributes[key] = value;
};

Component.prototype.setNullAttribute = function(key, value) {
  var attributes = this.context.parent.attributes;
  if (attributes[key] == null) attributes[key] = value;
};

function initComponent(context, component, parent, model, id, scope) {
  // Do generic controller initialization
  var componentContext = context.componentChild(component);
  Controller.call(component, parent.app, parent.page, model);
  Component.call(component, parent, componentContext, id, scope);

  // Do the user-specific initialization. The component constructor should be
  // an empty function and the actual initialization code should be done in the
  // component's init method. This means that we don't have to rely on users
  // properly calling the Component constructor method and avoids having to
  // play nice with how CoffeeScript extends class constructors
  emitInitHooks(context, component);
  component.emit('init', component);
  if (component.init) component.init(model);

  return componentContext;
}

function emitInitHooks(context, component) {
  if (!context.initHooks) return;
  // Run initHooks for `on` listeners immediately before init
  for (var i = 0, len = context.initHooks.length; i < len; i++) {
    context.initHooks[i].emit(context, component);
  }
}

function setAttributes(component, context, model) {
  if (!context.attributes) return;
  // Set attribute values on component model
  for (var key in context.attributes) {
    var attribute = context.attributes[key];
    if (key === 'attributes'){
      setAttributesObjectValue(attribute, component, context, model);
      continue;
    }
    setAttribute(key, attribute, component, context, model);
  }
}

function setAttributesObjectValue(attributes, component, context, model) {
  var attributesMeta = component._attributesMeta = {}
  attributesMeta.oldValues = {};

  var segments = getSegments(attributes, context);

  // Refs
  if (segments) {
    attributesMeta.type = 'ref'
    attributesMeta.segments = segments;
    var value = attributes.get(context, true);
    if (!isPlainObject(value)) {
      refAttribute(model, 'attributes', segments.join('.'));
      attributesMeta.oldValueIsObject = false;
      return;
    }
    attributesMeta.oldValueIsObject = true;
    for (var key in value) {
      if (key in context.attributes) continue;
      attributesMeta.oldValues[key] = true
      refAttribute(model, key, segments.join('.') + '.' + key)
    }

  } else {
    // Expr
    if (attributes instanceof templates.ParentWrapper) {
      attributesMeta.type = 'expression'
      var value = attributes.get(context, true);
      if (!isPlainObject(value)) {
        model.set('attributes', util.deepCopy(value));
        attributesMeta.oldValueIsObject = false;
        return;
      }
      attributesMeta.oldValueIsObject = true;
      attributesMeta.oldValues = {}

      for (var key in value) {
        if (key in context.attributes) continue;
        attributesMeta.oldValues[key] = true
        model.set(key, value[key]);
      }
    // Const
    } else {
      var value = attributes;

      attributesMeta.type = 'literal';

      if (isPlainObject(value)) {
        for (var key in attributes) {
          model.set(key, attributes[key]);
        }
      } else {
        model.set('attributes', attributes);
      }
    }
  }
}

function getSegments(attribute, context){
  var segments = (
    attribute instanceof templates.ParentWrapper &&
    attribute.expression &&
    attribute.expression.pathSegments(context)
  );
  return segments;
}

function refAttribute(model, key, path){
  model.root.ref(model._at + '.' + key, path, {updateIndices: true});
}

function setAttribute(key, attribute, component, context, model){
  var segments = getSegments(attribute, context);
  if (segments) {
    model.root.ref(model._at + '.' + key, segments.join('.'), {updateIndices: true});
  } else {
    if (attribute instanceof templates.ParentWrapper) {
      if (attribute.isPartial) {
        model.set(key, attribute);
      } else {
        component._attributeList = component._attributeList || [];
        component._attributeList.push(key);
        model.set(key, util.deepCopy(attribute.get(context, true)));
      }
    } else {
      model.set(key, attribute);
    }
  }
}


function createFactory(constructor) {
  return (constructor.prototype.singleton) ?
    new SingletonComponentFactory(constructor) :
    new ComponentFactory(constructor);
}

function ComponentFactory(constructor) {
  this.constructor = constructor;
}
ComponentFactory.prototype.init = function(context) {
  var component = new this.constructor();

  var parent = context.controller;
  var id = context.id();
  var scope = ['$components', id];
  var model = parent.model.root.eventContext(component);
  model._at = scope.join('.');
  model.set('id', id);
  setAttributes(component, context, model);
  // Store a reference to the component's scope such that the expression
  // getters are relative to the component
  model.data = model.get();
  parent.page._components[id] = component;

  return initComponent(context, component, parent, model, id, scope);
};
ComponentFactory.prototype.create = function(context) {
  var component = context.controller;
  component.emit('create', component);
  // Call the component's create function after its view is rendered
  if (component.create) {
    component.create(component.model, component.dom);
  }
};

function SingletonComponentFactory(constructor) {
  this.constructor = constructor;
  this.component = null;
}
SingletonComponentFactory.prototype.init = function(context) {
  if (!this.component) this.component = new this.constructor();
  return context.componentChild(this.component);
};
// Don't call the create method for singleton components
SingletonComponentFactory.prototype.create = function() {};

App.prototype.component = function(viewName, constructor, ns) {
  if (typeof viewName === 'function') {
    constructor = viewName;
    viewName = null;
  }

  // Inherit from Component
  extendComponent(constructor);

  // Set namespace to the component if it's passed along
  if (ns) constructor.prototype.ns = ns;

  // Load template view from serialized view file
  if (constructor.prototype.view) {
    var viewFilename = constructor.prototype.view.filename;
    viewName = viewName || constructor.prototype.name;
    if (!viewName) {
      // Get view name from the name of file (if not index) or folder
      viewName = path.basename(viewFilename, path.extname(viewFilename));
      if (viewName === 'index') {
        viewName = path.basename(path.dirname(viewFilename));
      }
    }
    if (ns) viewName = ns + ':' + viewName;
    this.loadViews(constructor.prototype.view, viewName);

  } else if (!viewName) {
    if (constructor.prototype.name) {
      viewName = constructor.prototype.name;
      if (ns) viewName = ns + ':' + viewName;
      var view = this.views.register(viewName);
      view.template = templates.createEmptyTemplate();
    } else {
      throw new Error('No view name specified for component');
    }
  }

  // Load sub components
  var subComponents = constructor.prototype.components;
  if (subComponents) {
    for (var i = 0, len = subComponents.length; i < len; i++) {
      this.component(null, subComponents[i], viewName);
    }
  }

  // Associate the appropriate view with the component type
  var view = this.views.find(viewName);
  if (!view) {
    var message = this.views.findErrorMessage(viewName);
    throw new Error(message);
  }
  view.componentFactory = createFactory(constructor);

  // Add component comment with hooks to the main view
  if (!view.template._hasComponentMarker) {
    var hooks = [new templates.ComponentMarker()];
    var marker = new templates.Comment(view.name, hooks);
    view.template.content.unshift(marker);
    view.template._hasComponentMarker = true;
  }

  // Make chainable
  return this;
};

function extendComponent(constructor) {
  // Don't do anything if the constructor already extends Component
  if (constructor.prototype instanceof Component) return;
  // Otherwise, replace its prototype with an instance of Component
  var oldPrototype = constructor.prototype;
  constructor.prototype = new Component();
  util.mergeInto(constructor.prototype, oldPrototype);
}
