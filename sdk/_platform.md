# ForkArcade — Platform Rules

These rules apply to EVERY game on the ForkArcade platform, regardless of template.

## 3 Screens (mandatory)

Every game MUST have at least 3 screens (`screen` state):

1. **Start screen** (`screen: 'start'`) — game title, short description, controls, prompt to begin (e.g. `[SPACE]`)
2. **Game screen** (`screen: 'playing'`) — actual gameplay
3. **End screen** (`screen: 'victory'` / `screen: 'defeat'` / `screen: 'death'`) — narrative text, stats, score, prompt to restart (e.g. `[R]`)

## Narrative (mandatory)

Narrative is the platform's mission — dev focuses on the game, narrative comes for free. But the player MUST see it in the game.

- Define a narrative graph with **nodes AND edges** in `FA.narrative.init()`
- Register narrative texts: `FA.register('narrativeText', nodeId, { text, color })`
- Display them in the game (e.g. bar at the top of the screen with fade out)
- Call `showNarrative(nodeId)` at key moments
- End screen shows appropriate narrative text

Narrative graph format:
```js
FA.narrative.init({
  startNode: 'awakening',
  variables: { hasKey: false, bossDefeated: false },
  graph: {
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
});
```

Edges define valid transitions. `transition()` warns in console if no edge exists from the current node to the target. The platform renders edges as `→ target1, target2` under each node in the Narrative panel.

`showNarrative` pattern:
```js
function showNarrative(nodeId) {
  var textDef = FA.lookup('narrativeText', nodeId);
  if (textDef) {
    // life is in milliseconds! dt in the engine is in ms (~16.67ms per tick)
    FA.setState('narrativeMessage', { text: textDef.text, color: textDef.color, life: 4000 });
  }
  FA.narrative.transition(nodeId);
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
- Platform may send `FA_SPRITES_UPDATE` to hot-reload sprites from the editor (handled by `sprites.js`)

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

## Platform Files (do not edit)

- `forkarcade-sdk.js` — SDK (scoring, auth)
- `fa-narrative.js` — narrative module (graph, variables, transition)
- `sprites.js` — generated from `_sprites.json` (matrix format: frames per sprite)
