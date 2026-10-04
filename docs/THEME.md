# The FactorAI Theme Guide

How the castle looks, why it looks that way, and where the implementation had to
diverge from the original plan.

## The idea

A coding swarm is a busy, invisible thing: a handful of agent processes
streaming text at a git remote. FactorAI makes it a *place* — a wizarding school
where you walk around and read the state of your infrastructure by looking at it.

| Domain concept | Castle object |
| --- | --- |
| Repository | A floor, themed after the repo's character |
| Coding agent | A wizard at a desk, running a real OS process |
| Issue | A potion order pinned to a kanban board |
| Pull request | A bottled potion on a shelf |
| Browser tests / CI | The central cauldron, bubbling harder as checks run |
| Repo management | The Head Mistress' office, east of the Great Hall |
| Floor navigation | A spiral stairwell with a warp dais |

The reading is deliberately two-sided: **the 3D world is the read surface**
(status, activity, failures are all visible from across the room) and **the 2D
overlay is the write surface** (assigning, moving orders, opening PRs, managing
repos). Nothing important can only be learned by opening a panel, and nothing
destructive can only be done from a panel.

## Visual style

Cel shading, hard edges, saturated magical palette. Concretely:

### Cel shading

`MeshToonMaterial` with a **hard-stepped gradient map**. `createToonGradient(steps)`
(`src/three/shaders/toon.ts`) builds a 1-D `DataTexture` with `NearestFilter`
sampling, which is what makes the terminator a hard step instead of a gradient.
Three ramps are in use: 2 steps for hard-edged trim, 3 for the classic cel look
(the default), 4 for soft organic surfaces like robes and plants.

### Rim light

`createToonMaterial` injects a rim term into the toon shader through
`onBeforeCompile`:

```glsl
float rimFactor = 1.0 - saturate(dot(normalize(normal), normalize(vViewPosition)));
gl_FragColor.rgb += uRimColor * pow(rimFactor, 2.5) * uRim;
```

This is what makes silhouettes read as *anime* rather than as flat-shaded low
poly — every wizard, pillar and bottle catches a candle-coloured edge. Set
`rim={0}` to opt a surface out.

### Outlines — a deliberate deviation

The plan specified `EffectComposer` + `OutlinePass` from
`@react-three/postprocessing` for the anime edges. **This build uses an
inverted-hull outline instead** (`createOutlineMaterial`, rendered by `<Toon>`).

Reasons:

- `OutlinePass` is a screen-space effect driven by a selection list. In this
  scene *everything* should be outlined — including wall segments behind the
  player and props at the far end of a room — which means registering hundreds
  of objects with `Select` and paying a selection pass over the whole frame.
- A screen-space outline cannot draw the interior edges of the geometry: the
  junction between a desk top and a desk leg, or where a wizard's arm crosses
  their robe, gets no line. Those interior lines are most of what makes cel
  shading read.
- The inverted hull is a vertex-shader offset along the normal, so it is even
  on hard-edged geometry:

  ```glsl
  vec3 inflated = position + normal * uThickness;
  ```

  Uniform *scaling* (the naive version) opens visible gaps at box corners;
  normal-offsetting does not.

`@react-three/postprocessing` is still used for the `EffectComposer`, for
`Bloom` (magical glow), `Vignette` and `SMAA`.

### Palette

All colours live in `src/three/theme.ts` so the 2D HUD and the 3D world share
one hand-painted set.

- Stone: `#4b3d6b` → `#332a4d`, lit warm from above, cool from the moon
- Candle gold `#f5c451` for trim, outlines-of-interest, and every interactive cue
- Potion green `#2fbf71`, ruby `#e0405f` for failures, arcane blue `#7ad7ff`
  for arcane/HUD information

Each of the ten floor themes overrides wall, floor, accent, light and fog tint,
so the alchemy lab reads green-lit and the observatory reads blue-lit without
any per-room special-casing.

### Atmosphere

- `fogExp2` at density 0.019, tinted per level, so distance reads as depth
- **Magic dust**: one additive `Points` cloud per region. All motion is in the
  vertex shader from a per-particle seed, so a few thousand motes cost one draw
  call and zero CPU work per frame. Density and brightness scale with activity:
  a working wizard gets a denser, brighter, faster cloud than an idle one.

  Particle layouts come from a seeded PRNG (`src/three/random.ts`) rather than
  `Math.random`, so a cloud never reshuffles on re-render and two floors never
  look cloned.

### Cel animation

No skeletal rigs. Every avatar and prop is built from primitives and animated
by directly rotating groups in `useFrame`, which keeps the whole cast inside the
palette and the outline pass, and keeps the bundle free of a model loader.

| Agent state | Behaviour |
| --- | --- |
| `idle` | Slow breathing bob, dim aura, wand at rest, sparse dust |
| `working` | Faster bob, arms move as if casting, bright gold aura, dense dust, spell book glows |
| `error` | Slumped posture, hat droops, red sparks, red aura, faster but dimmer flicker |

## Readable text in 3D

Kanban cards, spell-book runes, floor plaques, the office mirror and sign plates
are all drawn to a 2D canvas and uploaded as a texture
(`src/three/canvasTexture.ts`). This keeps text crisp without a font loader and
makes rich layouts (columns, cards, check bars, the repo constellation) practical.

The trade-off: redraws cost a canvas repaint. Boards are keyed on a signature of
their content, so a busy swarm does not repaint a board whose issues did not
change.

## Interaction model

Crosshair in the centre of the screen, `E` to interact.

Interaction is a small custom system (`src/three/Interaction.tsx`), not a picking
library:

- Interactables register a group on mount.
- Walls register as **occluders**.
- Every third frame, a raycast runs from the camera centre. The **first** thing
  the ray hits decides focus: an interactable becomes the HUD prompt; a wall
  means nothing is focused.

The occluder pass is what stops you reading a kanban board through a wall, which
is the failure mode a pure distance-and-angle check would have.

## Performance budget

One level is mounted at a time; the rest of the castle does not exist as far as
the renderer is concerned. Geometry comes from ~18 module-level singletons shared
across hundreds of meshes. Point lights are capped (one per brazier, sconce,
desk-lamp, cauldron and warp pad) and shadow casting is limited to a single
directional light. See "Risks" in the plan for the known trade-offs.