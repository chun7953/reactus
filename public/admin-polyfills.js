(function () {
  'use strict';

  if (!Object.fromEntries) {
    Object.fromEntries = function (entries) {
      var result = {};
      var list = Array.from(entries);
      for (var i = 0; i < list.length; i += 1) result[list[i][0]] = list[i][1];
      return result;
    };
  }

  if (!Array.prototype.flatMap) {
    Array.prototype.flatMap = function (callback, thisArg) {
      var result = [];
      for (var i = 0; i < this.length; i += 1) {
        if (!(i in this)) continue;
        var value = callback.call(thisArg, this[i], i, this);
        if (Array.isArray(value)) result.push.apply(result, value);
        else result.push(value);
      }
      return result;
    };
  }

  if (!String.prototype.replaceAll) {
    String.prototype.replaceAll = function (search, replacement) {
      if (search instanceof RegExp) {
        if (!search.global) throw new TypeError('replaceAll RegExp must be global');
        return this.replace(search, replacement);
      }
      return this.split(String(search)).join(String(replacement));
    };
  }

  if (!String.prototype.padStart) {
    String.prototype.padStart = function (targetLength, padString) {
      var value = String(this);
      var target = targetLength >> 0;
      var pad = String(padString === undefined ? ' ' : padString);
      if (value.length >= target || !pad) return value;
      var needed = target - value.length;
      while (pad.length < needed) pad += pad;
      return pad.slice(0, needed) + value;
    };
  }

  function nodesFromArgs(args) {
    var nodes = [];
    for (var i = 0; i < args.length; i += 1) {
      var item = args[i];
      nodes.push(item instanceof Node ? item : document.createTextNode(String(item)));
    }
    return nodes;
  }

  function fragmentFromArgs(args) {
    var fragment = document.createDocumentFragment();
    var nodes = nodesFromArgs(args);
    for (var i = 0; i < nodes.length; i += 1) fragment.appendChild(nodes[i]);
    return fragment;
  }

  if (!Element.prototype.append) {
    Element.prototype.append = function () {
      this.appendChild(fragmentFromArgs(arguments));
    };
  }

  if (!Element.prototype.prepend) {
    Element.prototype.prepend = function () {
      this.insertBefore(fragmentFromArgs(arguments), this.firstChild);
    };
  }

  if (!Element.prototype.before) {
    Element.prototype.before = function () {
      if (!this.parentNode) return;
      this.parentNode.insertBefore(fragmentFromArgs(arguments), this);
    };
  }

  if (!Element.prototype.after) {
    Element.prototype.after = function () {
      if (!this.parentNode) return;
      this.parentNode.insertBefore(fragmentFromArgs(arguments), this.nextSibling);
    };
  }

  if (!Element.prototype.replaceWith) {
    Element.prototype.replaceWith = function () {
      if (!this.parentNode) return;
      this.parentNode.replaceChild(fragmentFromArgs(arguments), this);
    };
  }

  if (!Element.prototype.replaceChildren) {
    Element.prototype.replaceChildren = function () {
      while (this.firstChild) this.removeChild(this.firstChild);
      if (arguments.length) this.appendChild(fragmentFromArgs(arguments));
    };
  }
})();
