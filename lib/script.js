var fs = require('fs'),
    path = require('path'),
    es = require('event-stream'),
    _ = require('underscore'),
    ast = require('cmd-util').ast,
    iduri = require('cmd-util').iduri,
    gutil = require('gulp-util'),
    PluginError = gutil.PluginError;

exports.jsParser = function(file, cb, options) {
  options = options || {};

  var data = file.contents.toString('utf8'),
      astCache;
  
  try {
    astCache = ast.getAst(data);
  } catch(e) {
    gutil.log('js parse error ', file.path);
    return cb(new PluginError(e.message + ' [ line:' + e.line + ', col:' + e.col + ', pos:' + e.pos + ' ]'));
  }
  
  var meta = ast.parseFirst(astCache);
  if (!meta) {
    gutil.log('file not cmd module ', file.path);
    return cb(null, file);
  }

  var depsSepecified = false,
      filename = path.relative(file.cwd, file.path),
      deps;
  if (meta.dependencyNode) {
    deps = meta.dependencies;
    depsSepecified = true;
  } else {
    deps = parseDependencies(file.path, options);
  }

  if(options.path){
    filename = path.relative( options.path, filename);
  }
  astCache = ast.modify(astCache, {
    id: meta.id ? meta.id : unixy(options.idleading + filename.replace(/\.js$/, '')),
    dependencies: deps,
    require: function(v) {
      return depsSepecified ? v : iduri.parseAlias(options, v);
    }
  });

  data = astCache.print_to_string(options.uglify);//gutil.log(astCache.body[0].body.args[0].value);
  data = addOuterBoxClass(data, options);
  file.contents = new Buffer(data);
  
  return cb(null, file);
};


//helpers
function unixy(uri) {
  return uri.replace(/\\/g, '/');
}

function appendext(uri){
  if (/\.(tpl|handlebars|html|json)$/.test(uri)) return uri;

  if (!/\.js$/.test(uri)) uri += '.js';
  return uri;
}

function getStyleId(options) {
  return unixy((options || {}).idleading || '')
    .replace(/\/$/, '')
    .replace(/\//g, '-')
    .replace(/\./g, '_');
}

function addOuterBoxClass(data, options) {
  // ex. arale/widget/1.0.0/ => arale-widget-1_0_0
  var styleId = getStyleId(options);
  if (options.styleBox && styleId) {
    data = data.replace(/(\}\)[;\n\r ]*$)/, 'module.exports.outerBoxClass="' + styleId + '";$1');
  }
  return data;
}

//module id not start with .
function moduleDependencies(id, options) {
  var alias = iduri.parseAlias(options, id);

  if (iduri.isAlias(options, id) && alias === id) return [];
  if (/^text!/.test(id)) return [];

  var file = /\.js$/.test(fpath) ? alias : alias + '.js';

  if (!/\.js$/.test(file)) return [];

  var fpath;
  options.paths.some(function(base){
    var filepath = path.join(base, file);
    if (fs.existsSync(filepath)) {
      fpath = filepath;
      return true;
    }
  });

  if (!fpath) {
    gutil.log('can\'t find module ' + alias);
    return [];
  }

  var data = fs.readFileSync(fpath, 'utf8');
  var parsed = ast.parse(data);
  var deps = [];

  var ids = parsed.map(function(meta){
    return meta.id;
  });

  parsed.forEach(function(meta){
    meta.dependencies.forEach(function(dep) {
      dep = iduri.absolute(alias, dep);
      if (!_.contains(deps, dep) && !_.contains(ids, dep) && !_.contains(ids, dep.replace(/\.js$/, ''))) {
        deps.push(dep);
      }
    });
  });
  return deps;
}

function parseDependencies(fpath, options) {
  var rootpath = fpath;

  function relativeDependencies(fpath, options, basefile) {
    if (basefile) fpath = path.join(path.dirname(basefile), fpath);
    fpath = appendext(fpath);

    //do not parse none js files
    if (!/\.js$/.test(fpath)) return [];

    var deps = [],
        moduleDeps = {};

    if (!fs.existsSync(fpath)) {
      gutil.log("can't find " + fpath);
      return [];
    }

    var parsed,
        data = fs.readFileSync(fpath, 'utf8');

    try {
      parsed = ast.parseFirst(data);
    } catch(e) {
      gutil.log(e.message + ' [ line:' + e.line + ', col:' + e.col + ', pos:' + e.pos + ' ]');
      return [];
    }
    parsed.dependencies.map(function(id) {
      return id.replace(/\.js$/, '');
    }).forEach(function(id){
      if (id.charAt(0) === '.') {
        if (basefile) {
          var altId = path.join(path.dirname(fpath), id),
              dirname = path.dirname(rootpath);
          if (dirname !== altId) {
            altId = path.relative(dirname, altId);
          } else {
            altId = path.relative(dirname, altId + '.js').replace(/\.js$/, '');
          }
          altId = unixy(altId);
          if (altId.charAt(0) !== '.') altId = './' + altId;
          deps.push(altId);
        } else {
          deps.push(id);
        }
        deps = _.union(deps, relativeDependencies(id, options, fpath));
      } else if (!moduleDependencies[id]) {
        //alias
        var alias = iduri.parseAlias(options, id);
        deps.push(alias);

        var ext = path.extname(alias);
        if (ext && ext !=='.js') return;

        var mdeps = moduleDependencies(id, options);
        moduleDeps[id] = mdeps;
        deps = _.union(deps, mdeps);
      }
    });
    
    return deps;
  }

  return relativeDependencies(fpath, options);
}