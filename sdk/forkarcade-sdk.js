// ForkArcade SDK v1
(function(window) {
  'use strict';

  // If platform already injected a bridge (direct load mode), skip postMessage setup
  if (window.ForkArcade && window.ForkArcade.sdkVersion) return;

  var _sdkVersion = 1;
  var _pending = {};
  var _ready = false;
  var _slug = null;
  var _version = null;
  var _parentOrigin = null;
  var _readyCallbacks = [];
  var _readyRetryInterval = null;
  var REQUEST_TIMEOUT = 10000;
  var MAX_READY_ATTEMPTS = 60;
  var READY_RETRY_MS = 500;

  function generateId() {
    return Math.random().toString(36).substring(2, 11);
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
    if (typeof data.type !== 'string' || data.type.indexOf('FA_') !== 0) return false;
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
          reject(new Error(type + ' timed out after ' + (REQUEST_TIMEOUT / 1000) + 's'));
        }
      }, REQUEST_TIMEOUT);
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
      // Stop retry loop
      if (_readyRetryInterval) {
        clearInterval(_readyRetryInterval);
        _readyRetryInterval = null;
      }
      // Fire all onReady callbacks
      var cbs = _readyCallbacks;
      _readyCallbacks = [];
      var ctx = { slug: _slug, version: _version };
      for (var i = 0; i < cbs.length; i++) cbs[i](ctx);
      return;
    }

    if (data.type === 'FA_SPRITES_UPDATE' && data.sprites) {
      var sprites = data.sprites;
      window.FA.clearSpriteCache(sprites);
      window.FA.assets.spriteDefs = sprites;
      return;
    }

    if (data.type === 'FA_MAP_UPDATE' && data.maps) {
      window.FA.assets.mapDefs = data.maps;
      var evt = new CustomEvent('fa-map-update', { detail: data.maps });
      window.dispatchEvent(evt);
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
      if (typeof score !== 'number' || !isFinite(score) || score < 0 || score > 1000000000) {
        return Promise.reject(new Error('Invalid score: must be a finite number between 0 and 1,000,000,000'));
      }
      return request('FA_SUBMIT_SCORE', { score: score, version: _version });
    },
    getPlayer: function() {
      return request('FA_GET_PLAYER');
    },
    updateNarrative: function(data) {
      if (!data) return;
      sendToParent({
        type: 'FA_NARRATIVE_UPDATE',
        variables: data.variables,
        graphs: data.graphs,
        event: data.event
      });
    },
    onReady: function(callback) {
      if (_ready) { callback({ slug: _slug, version: _version }); return; }
      _readyCallbacks.push(callback);
    },
    sdkVersion: _sdkVersion
  };

  // Send FA_READY and retry until FA_INIT is received
  var _readyAttempts = 0;
  sendToParent({ type: 'FA_READY' });
  _readyRetryInterval = setInterval(function() {
    if (_ready) {
      clearInterval(_readyRetryInterval);
      _readyRetryInterval = null;
      return;
    }
    _readyAttempts++;
    if (_readyAttempts >= MAX_READY_ATTEMPTS) {
      clearInterval(_readyRetryInterval);
      _readyRetryInterval = null;
      return;
    }
    sendToParent({ type: 'FA_READY' });
  }, READY_RETRY_MS);
})(window);
