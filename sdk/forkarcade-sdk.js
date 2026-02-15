// ForkArcade SDK v1
(function(window) {
  'use strict';

  var _sdkVersion = 1;
  var _pending = {};
  var _ready = false;
  var _slug = null;
  var _version = null;
  var _parentOrigin = null;

  function generateId() {
    return Math.random().toString(36).substr(2, 9);
  }

  function sendToParent(msg) {
    if (window.parent !== window) {
      var origin = _parentOrigin || '*';
      window.parent.postMessage(msg, origin);
    }
  }

  function isValidFAMessage(event) {
    var data = event.data;
    if (!data || !data.type) return false;
    if (!data.type.startsWith('FA_')) return false;
    if (_parentOrigin && event.origin !== _parentOrigin) return false;
    return true;
  }

  function request(type, payload) {
    return new Promise(function(resolve, reject) {
      var id = generateId();
      _pending[id] = { resolve: resolve, reject: reject };
      sendToParent(Object.assign({ type: type, requestId: id }, payload || {}));
      setTimeout(function() {
        if (_pending[id]) {
          delete _pending[id];
          reject(new Error('Request timed out'));
        }
      }, 10000);
    });
  }

  window.addEventListener('message', function(event) {
    if (!isValidFAMessage(event)) return;
    var data = event.data;

    if (data.type === 'FA_INIT') {
      _parentOrigin = event.origin;
      _slug = data.slug;
      _version = data.version || null;
      _ready = true;
      sendToParent({ type: 'FA_READY' });
      return;
    }

    if (data.type === 'FA_SPRITES_UPDATE' && data.sprites) {
      if (typeof SPRITE_DEFS !== 'undefined') {
        SPRITE_DEFS = data.sprites;
        for (var cat in SPRITE_DEFS) {
          for (var name in SPRITE_DEFS[cat]) {
            if (SPRITE_DEFS[cat][name]._c) delete SPRITE_DEFS[cat][name]._c;
          }
        }
      }
      return;
    }

    if (data.requestId && _pending[data.requestId]) {
      var handler = _pending[data.requestId];
      delete _pending[data.requestId];
      if (data.error) {
        handler.reject(new Error(data.error));
      } else {
        handler.resolve(data);
      }
    }
  });

  window.ForkArcade = {
    submitScore: function(score) {
      return request('FA_SUBMIT_SCORE', { score: score, version: _version });
    },
    getPlayer: function() {
      return request('FA_GET_PLAYER');
    },
    updateNarrative: function(data) {
      sendToParent({
        type: 'FA_NARRATIVE_UPDATE',
        variables: data.variables,
        currentNode: data.currentNode,
        graph: data.graph,
        event: data.event
      });
    },
    onReady: function(callback) {
      if (_ready) { callback({ slug: _slug, version: _version }); return; }
      var interval = setInterval(function() {
        if (_ready) { clearInterval(interval); callback({ slug: _slug, version: _version }); }
      }, 50);
    },
    sdkVersion: _sdkVersion
  };

  sendToParent({ type: 'FA_READY' });
})(window);
