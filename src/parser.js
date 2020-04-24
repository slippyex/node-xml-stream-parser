"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.EVENTS = undefined;

let _createClass = (function() {
  function defineProperties(target, props) {
    for (let i = 0; i < props.length; i++) {
      let descriptor = props[i];
      descriptor.enumerable = descriptor.enumerable || false;
      descriptor.configurable = true;
      if ("value" in descriptor) descriptor.writable = true;
      Object.defineProperty(target, descriptor.key, descriptor);
    }
  }

  return function(Constructor, protoProps, staticProps) {
    if (protoProps) defineProperties(Constructor.prototype, protoProps);
    if (staticProps) defineProperties(Constructor, staticProps);
    return Constructor;
  };
})();

const _stream = require("stream");

function _classCallCheck(instance, Constructor) {
  if (!(instance instanceof Constructor)) {
    throw new TypeError("Cannot call a class as a function");
  }
}

function _possibleConstructorReturn(self, call) {
  if (!self) {
    throw new ReferenceError(
      "this hasn't been initialised - super() hasn't been called"
    );
  }
  return call && (typeof call === "object" || typeof call === "function")
    ? call
    : self;
}

function _inherits(subClass, superClass) {
  if (typeof superClass !== "function" && superClass !== null) {
    throw new TypeError(
      "Super expression must either be null or a function, not " +
        typeof superClass
    );
  }
  subClass.prototype = Object.create(superClass && superClass.prototype, {
    constructor: {
      value: subClass,
      enumerable: false,
      writable: true,
      configurable: true
    }
  });
  if (superClass)
    Object.setPrototypeOf
      ? Object.setPrototypeOf(subClass, superClass)
      : (subClass.__proto__ = superClass);
}

/**
 * A fast XML parser for NodeJS using Writable streams.
 *
 * What this is:
 * Simple and fast XML parser purley written for NodeJS. No extra production dependencies.
 * A handy way parse ATOM/RSS/RDF feeds and such. No validation is made on the document that is parsed.
 *
 * Motivation
 * There is already quite a few parsers out there. I just wanted a parser that was as tiny and fast as possible to handle easy parsing of
 * RSS/ATOM/RDF feeds using streams, no fancy stuff needed. If you want more functionality you should check out other recommended parsers (see below)
 *
 * Usage
 * Just #pipe() a <stream.Readable> and you are ready to listen for events.
 * You can also use the #write() method to write directly to the parser.
 *
 * The source is written using ES2015, babel is used to translate to the dist.
 *
 * Other recommended parsers for node that are great:
 * https://github.com/isaacs/sax-js
 * https://github.com/xmppjs/ltx
 *
 * Events:
 * - text
 * - instruction
 * - opentag
 * - closetag
 * - cdata
 *
 * Comments are ignored, so there is no events for them.
 *
 */
const Parser = (function(_Writable) {
  _inherits(Parser, _Writable);

  function Parser() {
    _classCallCheck(this, Parser);

    let _this = _possibleConstructorReturn(
      this,
      (Parser.__proto__ || Object.getPrototypeOf(Parser)).call(this)
    );

    _this.state = STATE.TEXT;
    _this.buffer = "";
    _this.pos = 0;
    _this.tagType = TAG_TYPE.NONE;
    return _this;
  }

  _createClass(Parser, [
    {
      key: "_write",
      value: function _write(chunk, encoding, done) {
        chunk = typeof chunk !== "string" ? chunk.toString() : chunk;
        for (let i = 0; i < chunk.length; i++) {
          let c = chunk[i];
          let prev = this.buffer[this.pos - 1];
          this.buffer += c;
          this.pos++;

          switch (this.state) {
            case STATE.TEXT:
              if (c === "<") this._onStartNewTag();
              break;

            case STATE.TAG_NAME:
              if (prev === "<" && c === "?") {
                this._onStartInstruction();
              }
              if (prev === "<" && c === "/") {
                this._onCloseTagStart();
              }
              if (
                this.buffer[this.pos - 3] === "<" &&
                prev === "!" &&
                c === "["
              ) {
                this._onCDATAStart();
              }
              if (
                this.buffer[this.pos - 3] === "<" &&
                prev === "!" &&
                c === "-"
              ) {
                this._onCommentStart();
              }
              if (c === ">") {
                if (prev === "/") {
                  this.tagType = TAG_TYPE.SELF_CLOSING;
                }
                this._onTagCompleted();
              }
              break;

            case STATE.INSTRUCTION:
              if (prev === "?" && c === ">") this._onEndInstruction();
              break;

            case STATE.CDATA:
              if (this.buffer[this.pos - 3] === "]" && prev === "]" && c === ">") this._onCDATAEnd();
              break;

            case STATE.IGNORE_COMMENT:
              if (
                this.buffer[this.pos - 3] === "-" &&
                prev === "-" &&
                c === ">"
              )
                this._onCommentEnd();
              break;
          }
        }
        done();
      }
    },
    {
      key: "_endRecording",
      value: function _endRecording() {
        let rec = this.buffer.slice(1, this.pos - 1);
        this.buffer = this.buffer.slice(-1); // Keep last item in buffer for prev comparison in main loop.
        this.pos = 1; // Reset the position (since the buffer was reset)
        return rec;
      }
    },
    {
      key: "_onStartNewTag",
      value: function _onStartNewTag() {
        let text = this._endRecording().trim();
        if (text) {
          this.emit(EVENTS.TEXT, text);
        }
        this.state = STATE.TAG_NAME;
        this.tagType = TAG_TYPE.OPENING;
      }
    },
    {
      key: "_onTagCompleted",
      value: function _onTagCompleted() {
        let tag = this._endRecording();

        let _parseTagString2 = this._parseTagString(tag),
          name = _parseTagString2.name,
          attributes = _parseTagString2.attributes;

        if (name === null) {
          // Support for non standard doctype tags
          if (tag.toLowerCase().startsWith('!doctype')) {
            name = '!doctype';
            if (attributes === null) {
              attributes = {}; 
            }
          } else {
            this.emit(
              EVENTS.ERROR,
              new Error("Failed to parse name for tag" + tag)
            );
          }
        }

        if (this.tagType && this.tagType == TAG_TYPE.OPENING) {
          this.emit(EVENTS.OPEN_TAG, name, attributes);
        }

        if (this.tagType && this.tagType === TAG_TYPE.CLOSING) {
          this.emit(EVENTS.CLOSE_TAG, name, attributes);
        }
        if (this.tagType && this.tagType === TAG_TYPE.SELF_CLOSING) {
          if (
            Object.keys(attributes).length === 0 &&
            attributes.constructor === Object
          ) {
            attributes = { ___selfClosing___: true };
          }
          this.emit(EVENTS.OPEN_TAG, name, attributes);
          this.emit(EVENTS.CLOSE_TAG, name, attributes);
        }

        this.state = STATE.TEXT;
        this.tagType = TAG_TYPE.NONE;
      }
    },
    {
      key: "_onCloseTagStart",
      value: function _onCloseTagStart() {
        this._endRecording();
        this.tagType = TAG_TYPE.CLOSING;
      }
    },
    {
      key: "_onStartInstruction",
      value: function _onStartInstruction() {
        this._endRecording();
        this.state = STATE.INSTRUCTION;
      }
    },
    {
      key: "_onEndInstruction",
      value: function _onEndInstruction() {
        this.pos -= 1; // Move position back 1 step since instruction ends with '?>'
        let inst = this._endRecording();

        let _parseTagString3 = this._parseTagString(inst),
          name = _parseTagString3.name,
          attributes = _parseTagString3.attributes;

        if (name === null) {
          this.emit(
            EVENTS.ERROR,
            new Error("Failed to parse name for inst" + inst)
          );
        }
        this.emit(EVENTS.INSTRUCTION, name, attributes);
        this.state = STATE.TEXT;
      }
    },
    {
      key: "_onCDATAStart",
      value: function _onCDATAStart() {
        this._endRecording();
        this.state = STATE.CDATA;
      }
    },
    {
      key: "_onCDATAEnd",
      value: function _onCDATAEnd() {
        let text = this._endRecording(); // Will return CDATA[XXX] we regexp out the actual text in the CDATA.
        text = text.slice(text.indexOf("[") + 1, text.lastIndexOf("]>") - 1);
        this.state = STATE.TEXT;

        this.emit(EVENTS.CDATA, text);
      }
    },
    {
      key: "_onCommentStart",
      value: function _onCommentStart() {
        this.state = STATE.IGNORE_COMMENT;
      }
    },
    {
      key: "_onCommentEnd",
      value: function _onCommentEnd() {
        this._endRecording();
        this.state = STATE.TEXT;
      }

      /**
       * Helper to parse a tag string 'xml version="2.0" encoding="utf-8"' with regexp.
       * @param  {string} str the tag string.
       * @return {object}     {name, attributes}
       */
    },
    {
      key: "_parseTagString",
      value: function _parseTagString(str) {
        // parse name

        let name;
        const parsedString = /^([a-zäöüßÄÖÜA-Z0-9:_\-.\/]+?)(\s|$)/.exec(str);
        if (parsedString && parsedString.length > 0) {
          name = parsedString[1];
          const attributesString = str.substr(name.length);
          const attributeRegexp = /([a-zäöüßÄÖÜA-Z0-9:_\-.]+?)="([^"]+?)"/g;
          let match = attributeRegexp.exec(attributesString);
          let attributes = {};
          while (match != null) {
            attributes[match[1]] = match[2];
            match = attributeRegexp.exec(attributesString);
          }
          if (name[name.length - 1] === "/") {
            name = name.substr(0, name.length - 1);
          }
          return { name: name, attributes: attributes };
        }
        return { name: null, attributes: {} };
      }
    }
  ]);

  return Parser;
})(_stream.Writable);

exports.default = Parser;

const STATE = {
  TEXT: 0,
  TAG_NAME: 1,
  INSTRUCTION: 2,
  IGNORE_COMMENT: 4,
  CDATA: 8
};

const TAG_TYPE = {
  NONE: 0,
  OPENING: 1,
  CLOSING: 2,
  SELF_CLOSING: 3
};

const EVENTS = (exports.EVENTS = {
  ERROR: "error",
  TEXT: "text",
  INSTRUCTION: "instruction",
  OPEN_TAG: "opentag",
  CLOSE_TAG: "closetag",
  CDATA: "cdata"
});
