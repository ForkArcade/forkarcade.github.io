// ForkArcade Engine v1 — Narrative (multi-graph) + Simulation
// ENGINE FILE — do not modify in game repos
(function(window) {
  'use strict';

  if (!window.FA) window.FA = {};
  var FA = window.FA;
  var MAX_EVENTS = 20;
  var MOOD_EXPIRE = 100;

  FA.narrative = {
    variables: {},
    graphs: {},
    _events: [],
    _evaluating: false,
    _config: null,
    _actorStates: {},
    _simEnabled: false,

    init: function(config) {
      this._config = config;
      this.variables = config.variables || {};
      this.graphs = {};
      this._events = [];
      var gs = config.graphs || {};
      for (var id in gs) {
        this.graphs[id] = {
          currentNode: gs[id].startNode || null,
          nodes: gs[id].nodes || [],
          edges: gs[id].edges || []
        };
      }
      this._actorStates = {};
      this._simEnabled = !!(config.needs && config.jobs);
      if (this._simEnabled) this._initSimulation();
      this._sync();
    },

    transition: function(graphId, nodeId, event) {
      var g = this.graphs[graphId];
      if (!g) { console.warn('[FA.narrative] Unknown graph: ' + graphId); return; }
      if (g.edges && g.edges.length > 0 && g.currentNode) {
        var valid = false;
        for (var i = 0; i < g.edges.length; i++) {
          if (g.edges[i].from === g.currentNode && g.edges[i].to === nodeId) {
            valid = true; break;
          }
        }
        if (!valid) {
          console.warn('[FA.narrative] No edge from "' + g.currentNode + '" to "' + nodeId + '" in graph "' + graphId + '"');
        }
      }
      var prev = g.currentNode;
      g.currentNode = nodeId;
      if (event) {
        this._events.push(event);
        if (this._events.length > MAX_EVENTS) this._events.shift();
      }
      this._sync();
      FA.emit('narrative:transition', { graph: graphId, from: prev, to: nodeId, event: event });
    },

    setVar: function(name, value, reason) {
      var prev = this.variables[name];
      this.variables[name] = value;
      var evt = reason || (name + ' = ' + value);
      this._events.push(evt);
      if (this._events.length > MAX_EVENTS) this._events.shift();
      this._sync();
      FA.emit('narrative:varChanged', { name: name, value: value, prev: prev, reason: reason });
      this._evaluate();
    },

    getVar: function(name) {
      return this.variables[name];
    },

    getNode: function(graphId) {
      var g = this.graphs[graphId];
      if (!g || !g.nodes) return null;
      for (var i = 0; i < g.nodes.length; i++) {
        if (g.nodes[i].id === g.currentNode) return g.nodes[i];
      }
      return null;
    },

    getEvents: function() {
      return this._events;
    },

    // --- Simulation ---

    tick: function(dt) {
      if (!this._simEnabled) return;
      var needDefs = this._config.needs;
      var jobDefs = this._config.jobs;

      for (var id in this._actorStates) {
        var as = this._actorStates[id];

        // 1. Decay needs
        for (var nid in as.needs) {
          var def = needDefs[nid];
          if (def) as.needs[nid] = Math.max(0, as.needs[nid] - def.decay * dt);
        }

        // 2. Process active job
        if (as.job) {
          as.jobTimer -= dt;
          if (as.jobTimer <= 0) {
            var jdef = jobDefs[as.job];
            if (jdef && jdef.fulfills && as.needs[jdef.fulfills] !== undefined) {
              as.needs[jdef.fulfills] = Math.min(100, as.needs[jdef.fulfills] + jdef.restore);
            }
            as.job = null;
            as.jobTimer = 0;
          }
        }

        // 3. If idle, pick new job
        if (!as.job) {
          var picked = this._pickJob(id);
          if (picked) {
            as.job = picked;
            as.jobTimer = jobDefs[picked] ? jobDefs[picked].duration : 1;
          }
        }

        // 4. Age mood buffer, recalculate mood
        var sum = 0;
        for (var mi = as.moodBuffer.length - 1; mi >= 0; mi--) {
          as.moodBuffer[mi].age += dt;
          if (as.moodBuffer[mi].age > MOOD_EXPIRE) {
            as.moodBuffer.splice(mi, 1);
          } else {
            sum += as.moodBuffer[mi].value;
          }
        }
        as.mood = sum;
      }

      this._sync();
      FA.emit('narrative:tick', { actorStates: this._actorStates });
    },

    getActorState: function(id) {
      return this._actorStates[id] || null;
    },

    addMood: function(actorId, key) {
      var as = this._actorStates[actorId];
      if (!as) return;
      var val = (this._config.moods || {})[key];
      if (val === undefined) return;
      as.moodBuffer.push({ key: key, value: val, age: 0 });
    },

    opinion: function(a, b) {
      var as = this._actorStates[a];
      return as ? (as.relationships[b] || 0) : 0;
    },

    setOpinion: function(a, b, delta) {
      var as = this._actorStates[a];
      if (!as) return;
      as.relationships[b] = (as.relationships[b] || 0) + delta;
    },

    getActiveScenes: function() {
      var scenes = this._config ? this._config.scenes || [] : [];
      var active = [];
      for (var i = 0; i < scenes.length; i++) {
        if (this._matchCondition(scenes[i].condition)) {
          active.push(scenes[i].id || i);
        }
      }
      return active;
    },

    // --- Internal ---

    _initSimulation: function() {
      var actors = this._config.actors || {};
      var needIds = Object.keys(this._config.needs || {});
      for (var id in actors) {
        var a = actors[id];
        if (!a.priorities || a.priorities.length === 0) continue;
        var needs = {};
        for (var i = 0; i < needIds.length; i++) {
          var nid = needIds[i];
          needs[nid] = (a.needs && a.needs[nid] !== undefined) ? a.needs[nid] : 100;
        }
        this._actorStates[id] = {
          needs: needs,
          mood: 0,
          moodBuffer: [],
          job: null,
          jobTimer: 0,
          relationships: {}
        };
      }
    },

    _matchCondition: function(cond) {
      if (!cond) return true;
      if (cond.node) {
        var p = cond.node.indexOf(':');
        if (p < 0) return false;
        var gId = cond.node.substring(0, p);
        var nId = cond.node.substring(p + 1);
        var g = this.graphs[gId];
        return g && g.currentNode === nId;
      }
      if (cond.var !== undefined) {
        var val = this.variables[cond.var];
        if (cond.eq !== undefined && val !== cond.eq) return false;
        if (cond.gte !== undefined && !(val >= cond.gte)) return false;
        if (cond.lte !== undefined && !(val <= cond.lte)) return false;
        return true;
      }
      return true;
    },

    _getActiveSceneAction: function(actorId) {
      var scenes = this._config.scenes || [];
      for (var i = 0; i < scenes.length; i++) {
        var scene = scenes[i];
        if (!this._matchCondition(scene.condition)) continue;
        var cast = scene.cast || [];
        for (var j = 0; j < cast.length; j++) {
          if (cast[j].actor === actorId) return cast[j];
        }
      }
      return null;
    },

    _pickJob: function(actorId) {
      // Scene override first
      var sceneAction = this._getActiveSceneAction(actorId);
      if (sceneAction) {
        var jobDefs = this._config.jobs || {};
        if (jobDefs[sceneAction.action]) return sceneAction.action;
        return jobDefs['wander'] ? 'wander' : null;
      }

      // Autonomous: find lowest need, pick priority job
      var as = this._actorStates[actorId];
      var actor = this._config.actors[actorId];
      if (!as || !actor || !actor.priorities) return null;
      var jobDefs = this._config.jobs || {};
      var needDefs = this._config.needs || {};

      var lowestNeed = null;
      var lowestVal = 101;
      for (var nid in as.needs) {
        if (as.needs[nid] < lowestVal) {
          lowestVal = as.needs[nid];
          lowestNeed = nid;
        }
      }

      // If a need is critical, prioritize jobs that fulfill it
      var critical = lowestNeed && needDefs[lowestNeed] && lowestVal <= needDefs[lowestNeed].critical;
      if (critical) {
        for (var i = 0; i < actor.priorities.length; i++) {
          var jid = actor.priorities[i];
          if (jobDefs[jid] && jobDefs[jid].fulfills === lowestNeed) return jid;
        }
      }

      // Otherwise find job for lowest need, or fallback to first priority
      for (var i = 0; i < actor.priorities.length; i++) {
        var jid = actor.priorities[i];
        if (jobDefs[jid] && jobDefs[jid].fulfills === lowestNeed) return jid;
      }
      return actor.priorities[0] || null;
    },

    _evaluate: function() {
      if (this._evaluating) return;
      this._evaluating = true;
      for (var gId in this.graphs) {
        var g = this.graphs[gId];
        if (!g.edges) continue;
        for (var i = 0; i < g.edges.length; i++) {
          var e = g.edges[i];
          if (e.from !== g.currentNode) continue;
          if (e.var === undefined) continue;
          var val = this.variables[e.var];
          var match = true;
          if (e.eq !== undefined && val !== e.eq) match = false;
          if (e.gte !== undefined && !(val >= e.gte)) match = false;
          if (e.lte !== undefined && !(val <= e.lte)) match = false;
          if (match) {
            this._evaluating = false;
            this.transition(gId, e.to, e.var + ' \u2192 ' + e.to);
            return;
          }
        }
      }
      this._evaluating = false;
    },

    _sync: function() {
      if (typeof ForkArcade !== 'undefined') {
        ForkArcade.updateNarrative({
          variables: this.variables,
          graphs: this.graphs,
          event: this._events.length > 0 ? this._events[this._events.length - 1] : null,
          actorStates: this._actorStates
        });
      }
    }
  };

  // Content selection: first matching entry wins
  FA.select = function(entries) {
    if (!entries) return null;
    for (var i = 0; i < entries.length; i++) {
      var e = entries[i];
      if (e.node) {
        var p = e.node.indexOf(':');
        if (p < 0) continue;
        var gId = e.node.substring(0, p);
        var nId = e.node.substring(p + 1);
        var node = FA.narrative.getNode(gId);
        if (node && node.id === nId) return e;
      } else if (e.var !== undefined) {
        var val = FA.narrative.getVar(e.var);
        var match = true;
        if (e.eq !== undefined && val !== e.eq) match = false;
        if (e.gte !== undefined && !(val >= e.gte)) match = false;
        if (e.lte !== undefined && !(val <= e.lte)) match = false;
        if (match) return e;
      } else {
        return e;
      }
    }
    return null;
  };

})(window);
