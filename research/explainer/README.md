# Six ways to work with a memory

Open [the interactive Anatomy explainer](index.html), or read the [written companion](EXPLAINER.md). The HTML is a standalone file: copy it anywhere and open it in a browser. Its illustrations, styles, controller and example data are embedded. Optional source links require the surrounding repository or an internet connection.

The document explains the six original optional Circadian additions, their everyday uses, their possible place in the existing lifecycle, and the limits of the evidence. It is general-purpose memory research. None of the additions is installed into Circadian's live lifecycle.

## Read it

Choose an instrument, then compare its two conditions. The illustrations are physical analogies; the input, returned-data and boundary panels carry the precise explanation. Arrow keys switch tabs or states. The auto demo can be stopped; it also pauses during interaction and when the instrument is offscreen. Reduced-motion preference disables its initial autoplay and transitions. A theme button selects light or dark.

All twelve cases are captured by calling the actual prototype functions during the build. Browser controls replay those results; they do not run inference, retrieve live memory or contact a service. The shared-dinner story is an illustration of possible future composition, not an integrated test.

## Build and evidence

From the repository root:

```sh
bun research/explainer/build.ts
```

No package installation is needed. The builder produces `index.html`, [exhibits.json](exhibits.json) and [BUILD.json](BUILD.json). The receipt records source/output hashes, figure budgets and sampled geometry checks. [model.ts](model.ts) calls the six prototypes and derives readouts from their returned values. [PARTS.md](PARTS.md) explains the drawing inventory.

The displayed **120 tests / 492 assertions / zero failures** come from the prototype run recorded at **2026-10-11T22:45:23.873102+00:00** in [results.json](../prototypes/results.json). This documentation task did not rerun that unchanged suite. Its source hashes were rechecked. Of 93 mapped specification cases, 92 have deterministic checks; R14's behavioral comparison remains deferred. No actual model-benefit claim follows from these tests.

[VERIFICATION.json](VERIFICATION.json) records the separate document checks. They include all twelve readouts in both themes, the upstream line-end audit, geometry constraints, controller event handling, and desktop/mobile layout measurements. The [saved contact sheets](captures/sheetLight1.jpg) were rasterized from the browser's rendered SVG styles and visually inspected in both themes. They are illustration captures, not page screenshots.

The native preview's screenshot operation failed on this client. Native pointer/keyboard calls also returned success without the expected state change; DOM-dispatched controller checks passed. Full-page screenshot acceptance and end-to-end native input behavior are therefore not certified. Motion preference and pause logic are identified separately as code-inspected unless the verification receipt records a runtime check. These are document-verification limits, not prototype test failures.

## Sources and attribution

- Working lifecycle and integration boundaries: [Circadian README](../../README.md), [source map](../refinements/SOURCE-MAP.md), [prototype inventory](../prototypes/README.md).
- Six proposal specifications: [refinement index](../refinements/README.md).
- Implementation review: [peer review](../prototypes/PEER-REVIEW.md), [resolutions](../prototypes/REVIEW-RESOLUTION.md), [focused closure](../prototypes/PEER-CLOSURE.md). Later parent-only follow-ups remain identified there.
- Visual method requested by the operator: [Anatomy](https://skills.wheresryan.sh/anatomy#prompt), read from [upstream commit 240a9bf](https://github.com/wheresryan22/anatomy/tree/240a9bf7c50cc6226148762a1017466fcbc08523). The small drawing kit is vendored solely for building this research document under its [MIT license](vendor/anatomy/LICENSE). It adds no Circadian production dependency.

The examples are fictional prototype fixtures. No private mind content, session transcript or API credential is embedded. All changes for this explainer are under `research/`; production code, hooks and machine settings were untouched.
