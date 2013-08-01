var utils = require('./utils'),
  _ = require('lodash'),
  dateFormatter = require('./dateformatter');

exports.addslashes = function (input) {
  if (typeof input === 'object') {
    utils.each(input, function (value, key) {
      input[key] = exports.addslashes(value);
    });
    return input;
  }
  return input.replace(/\\/g, '\\\\').replace(/\'/g, "\\'").replace(/\"/g, '\\"');
};

exports.capitalize = function (input) {
  if (typeof input === 'object') {
    utils.each(input, function (value, key) {
      input[key] = exports.capitalize(value);
    });
    return input;
  }
  return input.toString().charAt(0).toUpperCase() + input.toString().substr(1).toLowerCase();
};

exports.date = function (input, format, offset, abbr) {
  var l = format.length,
    date = new dateFormatter.DateZ(input),
    cur,
    i = 0,
    out = '';

  if (offset) {
    date.setTimezoneOffset(offset, abbr);
  }

  for (i; i < l; i += 1) {
    cur = format.charAt(i);
    if (dateFormatter.hasOwnProperty(cur)) {
      out += dateFormatter[cur](date, offset, abbr);
    } else {
      out += cur;
    }
  }
  return out;
};
exports['default'] = function (input, def) {
  return (typeof input !== 'undefined' && (input || typeof input === 'number')) ? input : def;
};

exports.escape = exports.e = function (input, type) {
  if (typeof input !== 'string') {
    return input;
  }

  var i = 0,
    out = '',
    code;

  switch (type) {
  case 'js':
    input = input.replace(/\\/g, '\\u005C');
    for (i; i < input.length; i += 1) {
      code = input.charCodeAt(i);
      if (code < 32) {
        code = code.toString(16).toUpperCase();
        code = (code.length < 2) ? '0' + code : code;
        out += '\\u00' + code;
      } else {
        out += input[i];
      }
    }
    return out.replace(/&/g, '\\u0026')
      .replace(/</g, '\\u003C')
      .replace(/>/g, '\\u003E')
      .replace(/\'/g, '\\u0027')
      .replace(/"/g, '\\u0022')
      .replace(/\=/g, '\\u003D')
      .replace(/-/g, '\\u002D')
      .replace(/;/g, '\\u003B');

  default:
    return input.replace(/&(?!amp;|lt;|gt;|quot;|#39;)/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
};

exports.first = function (input) {
  if (typeof input === 'object' && !utils.isArray(input)) {
    return '';
  }

  if (typeof input === 'string') {
    return input.substr(0, 1);
  }

  return _.first(input);
};

exports.join = function (input, separator) {
  if (utils.isArray(input)) {
    return input.join(separator);
  }

  if (typeof input === 'object') {
    var out = [];
    utils.each(input, function (value, key) {
      out.push(value);
    });
    return out.join(separator);
  }
  return input;
};

exports.json = exports.json_encode = function (input, indent) {
  return JSON.stringify(input, null, indent || 0);
};

exports.last = function (input) {
  if (typeof input === 'object' && !utils.isArray(input)) {
    return '';
  }

  if (typeof input === 'string') {
    return input.charAt(input.length - 1);
  }

  return _.last(input);
};

exports.lower = function (input) {
  if (typeof input === 'object') {
    utils.each(input, function (value, key) {
      input[key] = exports.lower(value);
    });
    return input;
  }
  return input.toString().toLowerCase();
};

// Magic filter, hardcoded in parser
exports.raw = function (input) {
  return input;
};

exports.replace = function (input, search, replacement, flags) {
  var r = new RegExp(search, flags);
  return input.replace(r, replacement);
};

exports.reverse = function (input) {
  if (utils.isArray(input)) {
    return input.reverse();
  }
  return input;
};

exports.striptags = function (input) {
  if (typeof input === 'object') {
    utils.each(input, function (value, key) {
      input[key] = exports.striptags(value);
    });
    return input;
  }
  return input.toString().replace(/(<([^>]+)>)/ig, '');
};

exports.title = function (input) {
  if (typeof input === 'object') {
    utils.each(input, function (value, key) {
      input[key] = exports.title(value);
    });
    return input;
  }
  return input.toString().replace(/\w\S*/g, function (str) {
    return str.charAt(0).toUpperCase() + str.substr(1).toLowerCase();
  });
};

exports.uniq = function (input) {
  return _.uniq(input);
};

exports.upper = function (input) {
  if (typeof input === 'object') {
    utils.each(input, function (value, key) {
      input[key] = exports.upper(value);
    });
    return input;
  }
  return input.toString().toUpperCase();
};

exports.url_encode = function (input) {
  return encodeURIComponent(input);
};

exports.url_decode = function (input) {
  return decodeURIComponent(input);
};
