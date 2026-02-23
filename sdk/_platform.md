# ForkArcade — Platform Rules

These rules apply to EVERY game on the ForkArcade platform, regardless of template.

## 3 Screens (mandatory)

Every game MUST have at least 3 screens (`screen` state):

1. **Start screen** (`screen: 'start'`) — game title, short description, controls, prompt to begin (e.g. `[SPACE]`)
2. **Game screen** (`screen: 'playing'`) — actual gameplay
3. **End screen** (`screen: 'victory'` / `screen: 'defeat'` / `screen: 'death'`) — narrative text, stats, score, prompt to restart (e.g. `[R]`)

## Narrative (mandatory)

Narrative is the platform's mission — dev focuses on the game, narrative comes for free. But the player MUST see it in the game.

- Define **named graphs** with nodes and edges in `FA.narrative.init()`
- Register narrative texts: `FA.register('narrativeText', nodeId, { text, color })`
- Display them in the game (e.g. bar at the top of the screen with fade out)
- Call `showNarrative(graphId, nodeId)` at key moments
- End screen shows appropriate narrative text

### Multi-graph init
Define named graphs. Each graph has its own nodes, edges, and currentNode. Variables are global (shared across all graphs).

```js
FA.narrative.init({
  variables: { hasKey: false, bossDefeated: false },
  graphs: {
    arc: {
      startNode: 'awakening',
      nodes: [
        { id: 'awakening', type: 'scene', label: 'Awakening' },
        { id: 'explore', type: 'scene', label: 'Exploration' },
        { id: 'boss', type: 'choice', label: 'Boss Fight' },
        { id: 'victory', type: 'scene', label: 'Victory' },
        { id: 'defeat', type: 'scene', label: 'Defeat' }
      ],
      edges: [
        { from: 'awakening', to: 'explore' },
        { from: 'explore', to: 'boss' },
        { from: 'boss', to: 'victory' },
        { from: 'boss', to: 'defeat' },
        { from: 'defeat', to: 'explore' }
      ]
    }
  }
});
```

Graph categories: `arc` (global game arc), `quest_*` (per-NPC/quest), `situation_*` (specific events). Edges define valid transitions. `transition()` warns in console if no edge exists.

### Conditional edges
Edges with `var` conditions auto-trigger when `setVar()` changes a matching variable. First matching conditional edge wins. Unconditional edges (no `var`) require explicit `transition()` call.

```js
edges: [
  { from: 'stranger', to: 'acquaintance', var: 'npc_interactions', gte: 1 },  // auto
  { from: 'acquaintance', to: 'confidant', var: 'npc_interactions', gte: 3 }, // auto
  { from: 'routine', to: 'first_system' }  // manual — transition() only
]
```

Conditions: `eq`, `gte`, `lte` (same syntax as `FA.select`). Use for relationship graphs, progression thresholds. Keep dramatic beats (cutscenes, endings) as manual transitions.

### Transitions
```js
FA.narrative.transition('arc', 'explore');                    // graphId, nodeId
FA.narrative.transition('arc', 'victory', 'Boss defeated');   // graphId, nodeId, event
```

### Content selection
`FA.select(entries)` — priority-ordered array, first matching entry wins. Use for dialogues, thoughts, any narrative-driven content.

```js
FA.register('dialogues', 'npc_name', [
  { node: 'quest_npc:allied', text: 'I found intel.' },
  { var: 'day', gte: 3, text: 'You keep coming back.' },
  { text: 'Morning.' }  // fallback (no condition)
]);

var entry = FA.select(FA.lookup('dialogues', 'npc_name'));
var text = entry ? entry.text : null;
```

Conditions:
- `{ node: 'graphId:nodeId' }` — true when graph is at that node
- `{ var: 'name', eq: value }` — exact match
- `{ var: 'name', gte: N }` — greater or equal
- `{ var: 'name', lte: N }` — less or equal
- Conditions combine: `{ var: 'day', gte: 3, lte: 5, text: '...' }`
- No condition = always matches (fallback)

### showNarrative pattern
```js
function showNarrative(graphId, nodeId) {
  var textDef = FA.lookup('narrativeText', nodeId);
  if (textDef) {
    // life is in milliseconds! dt in the engine is in ms (~16.67ms per tick)
    FA.setState('narrativeMessage', { text: textDef.text, color: textDef.color, life: 4000 });
  }
  FA.narrative.transition(graphId, nodeId);
}
```
In the game loop count down: `if (state.narrativeMessage && state.narrativeMessage.life > 0) state.narrativeMessage.life -= dt;`
In the renderer display the bar with `alpha = Math.min(1, state.narrativeMessage.life / 1000)` for smooth fade out.

## Timing

**dt is in milliseconds** (~16.67ms per tick). Timers must use ms:
- `life: 4000` = 4 seconds
- `life: 2000` = 2 seconds
- NOT `life: 3` (that's 3ms = invisible)

## SDK

- `ForkArcade.onReady(callback)` — call on startup
- `ForkArcade.submitScore(score)` — call at end of game
- `ForkArcade.updateNarrative(data)` — report narrative state to the platform
- Platform hot-reloads sprites/maps from the editor via direct global mutation and CustomEvents

## Sprites

Sprites support multiple frames and an origin (anchor) point. Format:
```json
{ "w": 8, "h": 16, "palette": {...}, "origin": [4, 15], "frames": [[...], [...]] }
```

- `frames` — array of pixel grids (animation, behavior variants, tile variants)
- `origin` — `[ox, oy]` anchor point in pixel coords. `drawSprite` positions the sprite so that origin aligns with (x, y). Default `[0, 0]` (top-left). Use `[w/2, h-1]` for bottom-center (isometric objects, characters, trees).

```js
var sprite = getSprite('enemies', 'rat');
drawSprite(ctx, sprite, x, y, T);           // draws frame 0, origin-aligned
drawSprite(ctx, sprite, x, y, T, 2);        // draws frame 2
var count = spriteFrames(sprite);            // number of frames
// Animation: drawSprite(ctx, sprite, x, y, T, Math.floor(t / 200) % count)
```

`FA.draw.sprite(category, name, x, y, size, fallbackChar, fallbackColor, frame)` — renders sprite frame (frame index selects variant), or fallback text when no sprite exists. Variants = frames within one sprite.

## Style Presets

Games may have a style preset applied at creation time. Style data is in `.forkarcade.json`:
- `fontFamily` — CSS font family string (e.g. `"Orbitron, monospace"`)
- `style` — style preset key (e.g. `"dark-neon"`)

CSS custom properties are available on `:root` in `style.css`:
- `--fa-font` — font family
- `--fa-bg` — page background
- `--fa-canvas-bg` — canvas background
- `--fa-text` — text color
- `--fa-accent` — primary accent
- `--fa-accent2` — secondary accent

For canvas text rendering, use the CSS variable:
```js
var faFont = getComputedStyle(document.documentElement).getPropertyValue('--fa-font').trim() || 'monospace';
ctx.font = '16px ' + faFont;
```

## Evolve Changelog (mandatory during evolve)

When implementing an evolve issue, you MUST create a changelog file:

**Path**: `changelog/v{N}.md` (where N = new version number)

**Format**:
```markdown
# v{N} — {short title}

## Issue
{issue title} (#{issue_number})

## Changes
- {what was added/changed/fixed — bullet list}

## Reasoning
{why these decisions were made, tradeoffs considered, what was rejected and why}

## Files Modified
- `{file}` — {what changed}
```

This file is committed as part of the evolve PR. The platform displays it in the Changelog tab.

## Performance Rules

The game loop runs at ~60fps. Every allocation or expensive call per frame compounds into stuttering and GC pauses.

- **Never allocate in the game loop** — no `new Set()`, `new Array()`, `{}`, `[]` inside `FA.setUpdate` or render layers. Pre-allocate once, reuse with `.clear()` or index reset.
- **Cache expensive computations** — BFS, pathfinding, FOV, connectivity checks. Recompute only when input changes (e.g. parts spliced, player moved), not every frame.
- **Turn-based games: don't recompute per frame** — if state only changes on player action, cache results and skip recalculation in the render loop.
- **Guard `FA.narrative.setVar()` on value change** — never call it every frame. Compare with previous value first: `if (state._lastX !== val) { state._lastX = val; FA.narrative.setVar(...); }`
- **`ctx.shadowBlur` is expensive** — set shadow state once outside loops, not per entity. Batch draws by color/style, use a single `ctx.save()`/`ctx.restore()` per batch.
- **`ctx.createRadialGradient`/`createLinearGradient`** — create once and cache if inputs don't change. Never create per entity per frame.

## Platform Files (do not edit)

- `forkarcade-sdk.js` — SDK (scoring, auth, hot-reload)
- `fa-narrative.js` — narrative module (graph, variables, transition)
- `fa-renderer.js` — renderer + sprite runtime (`drawSprite`, `getSprite`, `spriteFrames`)
- `sprites.js` — sprite data only, generated from `_sprites.json` (no code, just `var SPRITE_DEFS = {...}`)
