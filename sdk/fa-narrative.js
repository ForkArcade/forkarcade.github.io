// ForkArcade Engine v1 — Narrative
// ENGINE FILE — do not modify in game repos
(function(window) {
  'use strict';

  var FA = window.FA;

  FA.narrative = {
    variables: {},
    currentNode: null,
    graph: { nodes: [], edges: [] },
    _events: [],

    init: function(config) {
      this.variables = config.variables || {};
      this.currentNode = config.startNode || null;
      this.graph = config.graph || { nodes: [], edges: [] };
      this._events = [];
      this._sync();
    },

    transition: function(nodeId, event) {
      var edges = this.graph.edges;
      if (edges && edges.length > 0 && this.currentNode) {
        var valid = false;
        for (var i = 0; i < edges.length; i++) {
          if (edges[i].from === this.currentNode && edges[i].to === nodeId) {
            valid = true;
            break;
          }
        }
        if (!valid) {
          console.warn('[FA.narrative] No edge from "' + this.currentNode + '" to "' + nodeId + '"');
        }
      }
      var prev = this.currentNode;
      this.currentNode = nodeId;
      if (event) {
        this._events.push(event);
        if (this._events.length > 20) this._events.shift();
      }
      this._sync();
      FA.emit('narrative:transition', { from: prev, to: nodeId, event: event });
    },

    setVar: function(name, value, reason) {
      var prev = this.variables[name];
      this.variables[name] = value;
      var evt = reason || (name + ' = ' + value);
      this._events.push(evt);
      if (this._events.length > 20) this._events.shift();
      this._sync();
      FA.emit('narrative:varChanged', { name: name, value: value, prev: prev, reason: reason });
    },

    getVar: function(name) {
      return this.variables[name];
    },

    getNode: function() {
      var self = this;
      if (!this.graph.nodes) return null;
      for (var i = 0; i < this.graph.nodes.length; i++) {
        if (this.graph.nodes[i].id === self.currentNode) return this.graph.nodes[i];
      }
      return null;
    },

    getEvents: function() {
      return this._events;
    },

    _sync: function() {
      if (typeof ForkArcade !== 'undefined') {
        ForkArcade.updateNarrative({
          variables: this.variables,
          currentNode: this.currentNode,
          graph: this.graph,
          event: this._events.length > 0 ? this._events[this._events.length - 1] : null
        });
      }
    }
  };

})(window);
