var _ = require('lodash'),
  utils = require('./utils'),
  lexer = require('./lexer');

var _t = lexer.types,
  parseVariable;

function escapeRegExp(str) {
  return str.replace(/[\-\/\\\^$*+?.()|\[\]{}]/g, '\\$&');
}

function TokenParser(tokens, filters, line) {
  this.out = [];
  this.state = [];
  this.filterApplyIdx = [];
  this._parsers = {};
  this.line = line;
  this.filters = filters;

  this.parse = function () {
    var self = this;

    _.each(tokens, function (token, i) {
      self.prevToken = tokens[i - 1];
      self.isLast = (i === tokens.length - 1);
      self.parseToken(token);
    });

    return self.out;
  };
}

TokenParser.prototype = {
  on: function (type, fn) {
    this._parsers[type] = fn;
  },

  parseToken: function (token) {
    var self = this,
      fn = self._parsers[token.type] || self._parsers['*'],
      match = token.match,
      prevToken = self.prevToken,
      lastState = (self.state.length) ? _.last(self.state) : null,
      temp,
      build;

    if (fn && typeof fn === 'function') {
      if (!fn.call(this, token)) {
        return;
      }
    }

    if (lastState &&
        lastState === _t.FILTER &&
        prevToken.type === _t.FILTER &&
        token.type !== _t.PARENCLOSE &&
        token.type !== _t.COMMA &&
        token.type !== _t.OPERATOR &&
        token.type !== _t.FILTER &&
        token.type !== _t.FILTEREMPTY) {
      self.out.push(', ');
    }

    switch (token.type) {
    case _t.WHITESPACE:
      break;

    case _t.STRING:
      self.out.push(match.replace(/\\/g, '\\\\'));
      self.filterApplyIdx.push(self.out.length - 1);
      break;

    case _t.NUMBER:
      self.out.push(match);
      self.filterApplyIdx.push(self.out.length - 1);
      break;

    case _t.FILTER:
      if (!self.filters.hasOwnProperty(match) || typeof self.filters[match] !== "function") {
        throw new Error('Invalid filter "' + match + '" found on line ' + self.line + '.');
      }
      self.out.splice(_.last(self.filterApplyIdx), 0, '_filters["' + match + '"](');
      self.state.push(token.type);
      break;

    case _t.FILTEREMPTY:
      if (!self.filters.hasOwnProperty(match) || typeof self.filters[match] !== "function") {
        throw new Error('Invalid filter "' + match + '" found on line ' + self.line + '.');
      }
      self.out.splice(_.last(self.filterApplyIdx), 0, '_filters["' + match + '"](');
      self.out.push(')');
      break;

    case _t.FUNCTION:
      self.state.push(token.type);
      self.out.push('((typeof ' + match + ' !== "undefined") ? ' + match +
        ' : ((typeof _ctx.' + match + ' !== "undefined") ? _ctx.' + match +
        ' : _fn))(');
      self.filterApplyIdx.push(self.out.length - 1);
      break;

    case _t.PARENOPEN:
      if (self.filterApplyIdx.length) {
        self.out.splice(_.last(self.filterApplyIdx), 0, '(');
        self.out.push(' || _fn)(');
      } else {
        self.out.push('(');
      }
      self.state.push(token.type);
      self.filterApplyIdx.push(self.out.length - 1);
      break;

    case _t.PARENCLOSE:
      temp = self.state.pop();
      if (temp !== _t.PARENOPEN && temp !== _t.FUNCTION && temp !== _t.FILTER) {
        throw new Error('Mismatched nesting state on line ' + self.line + '.');
      }
      self.out.push(')');
      self.filterApplyIdx.pop();
      break;

    case _t.COMMA:
      if (lastState !== _t.FUNCTION &&
          lastState !== _t.FILTER &&
          lastState !== _t.ARRAYOPEN &&
          lastState !== _t.CURLYOPEN &&
          lastState !== _t.PARENOPEN) {
        throw new Error('Unexpected comma on line ' + self.line + '.');
      }
      self.out.push(', ');
      self.filterApplyIdx.pop();
      break;

    case _t.VAR:
      self.parseVar(token, match, lastState, prevToken);
      break;

    case _t.BRACKETOPEN:
      if (!prevToken ||
          (prevToken.type !== _t.VAR &&
            prevToken.type !== _t.BRACKETCLOSE &&
            prevToken.type !== _t.PARENCLOSE)) {
        self.state.push(_t.ARRAYOPEN);
        self.filterApplyIdx.push(self.out.length);
      } else {
        self.state.push(token.type);
      }
      self.out.push('[');
      break;

    case _t.BRACKETCLOSE:
      temp = self.state.pop();
      if (temp !== _t.BRACKETOPEN && temp !== _t.ARRAYOPEN) {
        throw new Error('Unexpected closing square bracket on line ' + self.line + '.');
      }
      self.out.push(']');
      self.filterApplyIdx.pop();
      break;

    case _t.CURLYOPEN:
      self.state.push(token.type);
      self.out.push('{');
      self.filterApplyIdx.push(self.out.length - 1);
      break;

    case _t.COLON:
      if (lastState !== _t.CURLYOPEN) {
        throw new Error('Unexpected colon on line ' + self.line + '.');
      }
      self.out.push(':');
      self.filterApplyIdx.pop();
      break;

    case _t.CURLYCLOSE:
      if (self.state.pop() !== _t.CURLYOPEN) {
        throw new Error('Unexpected closing curly brace on line ' + self.line + '.');
      }
      self.out.push('}');

      self.filterApplyIdx.pop();
      break;

    case _t.DOTKEY:
      if (prevToken.type !== _t.VAR && prevToken.type !== _t.BRACKETCLOSE && prevToken.type !== _t.DOTKEY) {
        throw new Error('Unexpected key "' + match + '" on line ' + self.line + '.');
      }
      self.out.push('.' + match);
      break;

    case _t.OPERATOR:
      self.out.push(' ' + match + ' ');
      self.filterApplyIdx.pop();
      break;
    }
  },

  parseVar: function (token, match, lastState, prevToken) {
    var self = this,
      ctx = '_ctx.',
      temp,
      local,
      contexted;

    match = match.split('.');
    self.filterApplyIdx.push(self.out.length);
    if (lastState === _t.CURLYOPEN) {
      if (match.length > 1) {
        throw new Error('Unexpected dot on line ' + self.line + '.');
      }
      self.out.push(match[0]);
      return;
    }
    temp = match[0];

    function checkDot(ctx) {
      var c = ctx + temp,
        build = '';

      build = '(typeof ' + c + ' !== "undefined"';
      _.chain(match).rest(1).each(function (v) {
        build += ' && ' + c + '.hasOwnProperty("' + v + '")';
        c += '.' + v;
      });
      build += ')';

      return build;
    }

    function buildDot(ctx) {
      var c = ctx + temp;

      return '(' + checkDot(ctx) + ' ? ' + ctx + match.join('.') + ' : "")';
    }

    self.out.push('(' + checkDot('') + ' ? ' + buildDot('') + ' : ' + buildDot('_ctx.') + ')');
  }
};

exports.parse = function (source, opts, tags, filters) {
  source = source.replace(/\r\n/g, '\n');
  // Split the template source based on variable, tag, and comment blocks
  // /(\{\{.*?\}\}|\{\%.*?\%\}|\{\#[^.*?\#\})/
  var escape = opts.autoescape,
    tagOpen = opts.tagControls[0],
    tagClose = opts.tagControls[1],
    varOpen = opts.varControls[0],
    varClose = opts.varControls[1],
    escapedTagOpen = escapeRegExp(tagOpen),
    escapedTagClose = escapeRegExp(tagClose),
    escapedVarOpen = escapeRegExp(varOpen),
    escapedVarClosed = escapeRegExp(varClose),
    tagStrip = new RegExp('^' + escapedTagOpen + '\\s*|\\s*' + escapedTagClose + '$', 'g'),
    varStrip = new RegExp('^' + escapedVarOpen + '\\s*|\\s*' + escapedVarClosed + '$', 'g'),
    cmtOpen = opts.cmtControls[0],
    cmtClose = opts.cmtControls[1],
    splitter = new RegExp(
      '(' +
        escapedTagOpen + '.*?' + escapedTagClose + '|' +
        escapedVarOpen + '.*?' + escapedVarClosed + '|' +
        escapeRegExp(cmtOpen) + '.*?' + escapeRegExp(cmtClose) +
        ')'
    ),
    line = 1,
    stack = [],
    parent = null,
    tokens = [],
    blocks = {},
    inRaw = false;

  function parseVariable(str, line) {
    if (!str) {
      return;
    }

    var tokens = lexer.read(utils.strip(str)),
      parser,
      addescape,
      out;

    addescape = escape && !(_.some(tokens, function (token) {
      return (token.type === _t.FILTEREMPTY || token.type === _t.FILTER) && token.match === 'raw';
    }));

    if (addescape) {
      tokens.unshift({ type: _t.PARENOPEN, match: '(' });
      tokens.push({ type: _t.PARENCLOSE, match: ')' });
      tokens.push({
        type: _t.FILTEREMPTY,
        match: 'e'
      });
    }

    parser = new TokenParser(tokens, filters, line);
    out = parser.parse().join('');

    if (parser.state.length) {
      throw new Error('Unable to parse "' + str + '" on line ' + line + '.');
    }

    return {
      compile: function () {
        return '_output += ' + out + ';\n';
      }
    };
  }
  exports.parseVariable = parseVariable;

  function parseTag(str, line) {
    if (!str) {
      return;
    }

    var tokens, parser, chunks, tagName, tag, args, last;

    if (utils.startsWith(str, 'end')) {
      last = _.last(stack);
      if (last.name === str.replace(/^end/, '') && last.ends) {
        switch (last.name) {
        case 'autoescape':
          escape = opts.autoescape;
          break;
        case 'raw':
          inRaw = false;
          break;
        }
        stack.pop();
        return;
      }

      throw new Error('Unexpected end of tag "' + str.replace(/^end/, '') + '" on line ' + line + '.');
    }

    if (inRaw) {
      return;
    }

    chunks = str.split(/\s+(.+)?/);
    tagName = chunks.shift();

    if (!tags.hasOwnProperty(tagName)) {
      throw new Error('Unexpected tag "' + str + '" on line ' + line + '.');
    }

    tokens = lexer.read(utils.strip(chunks.join(' ')));
    parser = new TokenParser(tokens, filters, line);

    tag = tags[tagName];

    if (!tag.parse(chunks[1], line, parser, _t, stack)) {
      throw new Error('Unexpected tag "' + tagName + '" on line ' + line + '.');
    }

    parser.parse();
    args = parser.out;

    switch (tagName) {
    case 'autoescape':
      escape = (args[0] === 'true');
      break;
    case 'raw':
      inRaw = true;
      break;
    }

    return {
      compile: tag.compile,
      args: args,
      content: { tokens: [] },
      ends: tag.ends,
      name: tagName
    };
  }

  source = _.without(source.split(splitter), '');

  _.each(source, function (chunk) {
    var token, lines;

    if (!inRaw && utils.startsWith(chunk, varOpen) && utils.endsWith(chunk, varClose)) {
      token = parseVariable(chunk.replace(varStrip, ''), line);
    } else if (utils.startsWith(chunk, tagOpen) && utils.endsWith(chunk, tagClose)) {
      token = parseTag(chunk.replace(tagStrip, ''), line);
      if (token) {
        switch (token.name) {
        case 'extends':
          parent = token.args.join('').replace(/^\'|\'$/g, '').replace(/^\"|\"$/g, '');
          break;
        case 'block':
          blocks[token.args.join('')] = token;
          break;
        }
      }
      if (inRaw && !token) {
        token = chunk;
      }
    } else if (inRaw || (!utils.startsWith(chunk, cmtOpen) && !utils.endsWith(chunk, cmtClose))) {
      token = chunk;
    }

    if (!token) {
      return;
    }

    if (stack.length) {
      stack[stack.length - 1].content.tokens.push(token);
    } else {
      tokens.push(token);
    }

    if (token.name && token.ends) {
      stack.push(token);
    }

    lines = chunk.match(/\n/g);
    line += (lines) ? lines.length : 0;
  });

  return {
    name: opts.filename,
    parent: parent,
    tokens: tokens,
    blocks: blocks
  };
};

// Re-Map blocks within a list of tokens to the template's block objects
function remapBlocks(tokens, template) {
  return _.map(tokens, function (token) {
    var args = token.args ? token.args.join('') : '';
    if (token.name === 'block' && template.blocks[args]) {
      token = template.blocks[args];
    }
    if (token.content && token.content.tokens && token.content.tokens.length) {
      token.content.tokens = remapBlocks(token.content.tokens, template);
    }
    return token;
  });
}

exports.compile = function (template, parent, options, blockName) {
  var out = '',
    tokens = template.tokens;

  if (parent && template.blocks) {
    tokens = remapBlocks(parent.tokens, template);
  }

  _.each(tokens, function (token, index) {
    if (typeof token === 'string') {
      out += '_output += "' + token.replace(/\n|\r/g, '\\n').replace(/"/g, '\\"') + '";\n';
      return;
    }

    out += token.compile(exports.compile, token.args, token.content, parent, options, blockName);
  });

  return out;
};
