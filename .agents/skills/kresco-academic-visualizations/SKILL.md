---
name: kresco-academic-visualizations
description: "Create, edit, or review Kresco course academic visualizations for Moroccan Bac math, physics, and chemistry: full interactive labs, inline course animations, SVG/canvas/React simulations, formulas, visual proofs, concept explainers, and screenshot-verified educational animations. Use for requests such as 'create a lab', 'create an animation', 'show this concept visually', 'fix this SVG animation', or 'make an interactive explainer'."
---

# Kresco Academic Visualizations

Use this skill for student-facing academic labs and inline animations inside Kresco courses.

## Classify First

Choose exactly one target before editing:

- `lab`: a large or full-page interactive explainer. Use multiple controls when they expose the concept, layer toggles to reduce clutter, a visible model/readout, and minimal copy.
- `inline-animation`: a compact course component between definitions, formulas, or examples. Show one concept only. Use passive playback, replay, or one simple control. Use minimal copy.

If the requested scope mixes both, build the smaller `inline-animation` first unless the user asks for a full lab.

## Embedded Kresco Context

Use this context even when the original Kresco repo docs are not available.

- Kresco is a learning platform for structured academic practice and support. The product is authenticated study work, not a marketing site.
- Student surfaces should feel focused, friendly, structured, modern, and precise. Motivation comes from progress, useful actions, and clear feedback.
- The visual priority is the learning surface: lesson visual, controls, formula/readout, and optional state details. Do not lead with a hero, campaign headline, or feature tour.
- Use Kresco purple `#453dee` as an accent for primary actions, selected state, focus, progress, and important traces. Do not tint the whole interface purple.
- If no design tokens exist, define or map to this minimum set: page `#f7f7fb`, card `#ffffff`, border `#e5e7eb`, primary text `#171625`, secondary text `#5f6272`, soft accent `#eeefff`, accent `#453dee`.
- Use a rounded sans UI typeface. Keep typography fixed and readable; do not use fluid hero-scale type inside app/course surfaces.
- Use compact section titles, tabular numbers, clear progress/readouts, skeletons for loading regions, and explicit loading/error/success states for async actions.
- Avoid generic AI UI: decorative gradients, gradient text, glassmorphism, decorative blobs, full-purple palettes, repeated icon-card grids, oversized radii, heavy shadows, side-stripe cards, and fake zero-value dashboards.

## Local Project Use

- If `PRODUCT.md`, `DESIGN.md`, CSS tokens, or representative components exist in the current repo, read the directly relevant ones before substantial UI work and follow them over the fallback values above.
- Use existing frontend patterns before adding new primitives.
- Do not install shadcn unless the user asks. Use shadcn-style composition only where it matches existing primitives.
- In Next.js/React projects, respect server/client boundaries and the framework version in that repo.

## Self-Contained Render Stack

Use these Kresco render decisions even outside the original repo:

- Target React client components for interactive visualizations. Add `'use client'` when using state, effects, refs, browser APIs, canvas, Framer Motion, or KaTeX DOM rendering.
- Prefer this dependency order when available: native SVG/canvas for the concept scene; KaTeX for formulas; Framer Motion for component motion; Radix Slider or native range input for sliders; Recharts for standard charts; D3 utilities for scales/easing only when they reduce math or path mistakes; Lucide for UI icons.
- Do not add a new visualization dependency unless the concept cannot be implemented reliably with SVG/canvas, KaTeX, Framer Motion, Recharts, and small helpers.
- Lazy-load heavy interactive renderers with `next/dynamic` and `ssr: false`. Provide a skeleton with a clear loading label and no fake successful data.
- If a renderer key architecture exists, route course content through `renderer_key` and optional `metadata.component` / `metadata.source_component`. Keep alias maps explicit.
- For new domains, use this shape: shared renderer registry -> subject source renderer -> lazy source component -> concrete lab/inline component.
- Keep source-specific physics/math engines in separate files when formulas, numerical integration, ray tracing, or wave mechanics exceed simple derived values.
- Use a visible fallback renderer that shows the requested renderer key and available config counts instead of silently rendering nothing.

## Formula Render Contract

- Store formulas as LaTeX strings. In JavaScript strings, double-escape backslashes.
- Render formulas through a `Latex` component contract: `formula: string`, optional `block: boolean`, optional `className`.
- Use KaTeX `renderToString(formula, { throwOnError: true, displayMode: block })`; cache rendered formulas; import `katex/dist/katex.min.css`.
- On KaTeX errors, render a visible error box with the original formula. Do not hide invalid math.
- Use block formulas for important laws/readouts and inline formulas only inside short labels or notes.
- Put formulas in scrollable or wrapping containers so long equations cannot overflow the component.

## Academic Grounding

- Identify the subject, level, and intended Moroccan Bac concept before designing the visual.
- If a formula, law, curriculum expectation, or notation is not already clear from local context, do one targeted web search against official or credible Moroccan Bac sources. Extract only the formulas, variables, and constraints needed for the implementation.
- Use LaTeX for formulas and follow the Formula Render Contract.
- Prefer mathematically or physically correct behavior. If the visualization must abstract the model, encode the abstraction deliberately and state the approximation in implementation notes or final response, not as in-app filler copy.
- Make time observable: use pause/replay or speed controls when the student must watch a process unfold.

## Content Rules

- Keep explanatory copy outside the visual core unless it labels controls, state, formulas, or a necessary variable.
- Do not add paragraphs that explain what the course text already explains.
- For labs, put optional details behind toggles: equations, traces, vectors, fields, labels, values, or idealized/real variants.
- For inline animations, do not include dashboards, side panels, multi-step instructions, or unrelated variables.

## Component Shape

For a `lab`, separate these concerns when the file would otherwise become a monolith:

- model/constants/equations
- geometry or derived SVG/canvas coordinates
- scene rendering
- controls
- readouts/formulas

For an `inline-animation`, keep the component compact, but still name constants and geometry helpers when they prevent magic numbers.

Avoid global state for isolated visualization controls. Keep derived values derived during render unless runtime measurement or animation lifecycle requires an effect.

## Visual System

- Start with the usable study surface, not a marketing hero.
- Use quiet layout: workspace, controls, optional readout. Do not build nested cards.
- Use cards only for repeated items, modals, or genuinely framed tools.
- Avoid gradient text, glassmorphism, decorative blobs, side-stripe cards, repeated icon-card grids, sketchy SVG illustrations, and full-purple surfaces.
- Use tabular numbers for timers, values, counters, and measured outputs.
- Keep touch/click targets at least 40px by 40px unless the surrounding control provides the hit area.
- Use `text-wrap: balance` for short headings and `text-wrap: pretty` for prose where supported.
- Ensure body text contrast meets WCAG AA. Do not use low-contrast muted gray on tinted surfaces.

## SVG And Animation Rules

- Define the SVG coordinate system before drawing. Prefer named geometry values over hand-tuned path strings.
- Generate arcs, traces, rays, vectors, and paths from centers, radii, endpoints, or angles. Do not guess dashed paths by eye.
- Use `viewBox`, stable aspect ratios, and explicit bounds so labels and strokes cannot clip.
- Use `vector-effect="non-scaling-stroke"` where scaling would distort strokes.
- Attach labels to their geometry. Keep labels outside moving parts unless the label is meant to move with that part.
- Use explicit transitions only; never use `transition: all`.
- Prefer transform and opacity for motion. Animate layout only when the layout change is the concept.
- Respect `prefers-reduced-motion`.

## Canvas And Runtime Rules

- Use canvas for dense fields, waves, particle systems, or repeated redraws. Use SVG for inspectable geometry, labels, formulas, rays, circuits, and low-count shapes.
- For canvas, keep the simulation engine/model outside the draw function. Store engine instances and transient interaction state in refs.
- Start `requestAnimationFrame` in an effect and always cancel it in cleanup. Use timestamp deltas for time-based motion.
- Resize canvas from its container, then reset or re-project the simulation state deliberately. Do not let canvas dimensions drift from CSS size.
- Draw labels with enough backing box/contrast when they sit over dynamic visuals.
- For charts, disable ornamental series animation when a simulation clock or scrubber already controls time.
- Use derived arrays/data from `useMemo` when chart points depend on controls.
- Reset or clamp time when changing parameters that invalidate the current state.

## Verification Gate

Do not deliver SVG, canvas, or animation work after code inspection only.

For `lab`:

- Capture a desktop screenshot of the full lab.
- Capture close-up screenshots of critical geometry: labels, dashed paths, arcs, vectors, formulas, controls, and moving parts.
- Check at least two meaningful states, such as initial/final, open/closed switch, min/max slider, or toggles on/off.
- Check browser console errors when a runtime browser check is used.

For `inline-animation`:

- Capture at least one screenshot of the component.
- Capture close-ups when it includes labels, dashed paths, arrows, formulas, or small SVG details.
- Check every available state if it has one switch/slider/replay control.

Desktop verification is required. Mobile verification is optional unless the user asks or the layout change is responsive.

If a screenshot shows clipped text, unreadable formulas, misaligned paths, incorrect geometry, overlapping controls, or hidden moving parts, fix the implementation and recheck the affected state.

## Validation

- After code edits, run from `frontend/`: `npm run typecheck` and `npm run lint`, unless the change is docs-only.
- Add focused tests only when logic changed and a relevant test exists.
- Do not run full builds, broad test suites, or E2E by default.

In the final response, report:

- output type: `lab` or `inline-animation`
- curriculum/source grounding used, or why it was not needed
- screenshot states checked
- validation commands and results
