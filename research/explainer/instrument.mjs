import * as k from './vendor/anatomy/iso-kit.mjs';

// These are physical analogies. Evidence and software outcomes belong to the page.
const WIDTH = 700;
const HEIGHT = 440;
const BASE = { x: -138, y: -92, w: 276, d: 184, r: 7 };
const P = k.fitProjection(k.boxCorners(BASE, -19, 71), WIDTH, HEIGHT,
  { pad: 43, azimuth: 48, elevation: 38 });
const line = (d, tone = 'faint') => k.lineSvg(d, { tone });
const plan = (x, y, w, d, r = 0.8) => ({ x, y, w, d, r });
const outline = (p, z, inset = 2, tone = 'faint') => line(k.planOutline(k.insetPlan(p, inset), z, P, 4), tone);
const dots = (points, size = 0.48) => k.dotsSvg(points.map(p => k.iso(p, P)), { size });
const accent = '--anatomy-lit:var(--anatomy-green);--anatomy-lit-top:color-mix(in srgb,var(--anatomy-green) 12%,var(--anatomy-top));--anatomy-lit-shade:color-mix(in srgb,var(--anatomy-green) 10%,var(--anatomy-shade-2))';

export const sceneDescriptions = Object.freeze({
  '01': { a: 'A narrow aperture exposes one of three retained source cards.', b: 'The wider aperture exposes two of the same three retained source cards; the third stays masked.' },
  '02': { a: 'A cross-key seats in two agreeing gauge bars; the third bar remains out of registration.', b: 'The differently cut third bar prevents the common cross-key from seating.' },
  '03': { a: 'The tagged source card occupies the speaker groove of the attribution jig.', b: 'The same card occupies the subject groove; its two role markers remain distinct.' },
  '04': { a: 'Three evidence tongues are seated and the common clasp closes.', b: 'The calendar tongue is retracted into its cradle, leaving the common clasp open.' },
  '05': { a: 'Three participant tabs belong to one full-width event page.', b: 'Three separately bound pages each hold a pair of participant tabs.' },
  '06': { a: 'Matching impressions leave clearance for the checking teeth and the press closes.', b: 'One shifted impression obstructs a checking tooth, so the press remains raised.' },
});

function scene(id, state) {
  const parts = [];
  const prefix = `instrument-${id}-${state}`;
  function slab(name, p, z, h, { tone = 'mid', lit = false, detail = '', bevel = 0.45 } = {}) {
    const shape = k.slabOf(p, z, h, P, 4, Math.min(bevel, h / 3));
    const svg = k.solidSvg(shape, { tone, lit, crease: lit ? 'mid' : 'faint', inner: detail });
    parts.push({ name, p, z, h, svg: `<g data-part="${prefix}-${name}"${lit ? ` style="${accent}"` : ''}>${svg}</g>` });
  }
  function fastener(name, x, y, z, size = 3.2) {
    const p = plan(x - size / 2, y - size / 2, size, size, 0.45);
    slab(name, p, z, 0.6, { tone: 'lo', detail: dots([[x, y, z + 0.6]], 0.44), bevel: 0.12 });
  }
  function card(name, x, y, w, d, z, { lit = false, h = 1.4, code = 3 } = {}) {
    const p = plan(x, y, w, d, 1);
    const slots = Array.from({ length: code }, (_, n) => outline(plan(x + 5, y + 6 + n * 6, Math.max(8, w - 10 - n * 3), 1.8, 0.8), z + h, 0, 'lo')).join('');
    slab(name, p, z, h, { tone: 'hi', lit, detail: outline(p, z + h, 2.5) + slots, bevel: 0.2 });
  }
  function bed() {
    const p = plan(-116, -53, 232, 106, 3);
    slab('tool-bed', p, 3, 5, { detail: outline(p, 8, 3) });
  }
  function commonBench() {
    for (const [n, [x, y]] of k.corners(BASE, 22).entries()) {
      slab(`foot-pad-${n}`, plan(x - 9, y - 8, 18, 16, 2), -19, 3, { tone: 'lo' });
      slab(`foot-stem-${n}`, plan(x - 6.5, y - 5.5, 13, 11, 1.3), -16, 4, { tone: 'lo' });
    }
    slab('plinth', BASE, -12, 10, { tone: 'lo', bevel: 1.5,
      detail: line(k.sideSeam(BASE, -5, P, 4)) });
    const cap = k.insetPlan(BASE, 1.2);
    slab('plinth-cap', cap, -2, 2, { tone: 'lo', bevel: 0.6, detail: outline(cap, 0, 5) });
    k.corners(BASE, 11).forEach(([x, y], n) => fastener(`plinth-screw-${n}`, x, y, 0, 4));
    for (const [n, y] of [-56, 50].entries()) {
      slab(`mount-runner-${n}`, plan(-118, y, 236, 6, 1), 0, 3, { tone: 'mid' });
      for (const [j, x] of [-123, 118].entries()) {
        const stop = plan(x, y - 2, 5, 10, 1);
        slab(`runner-stop-${n}-${j}`, stop, 0, 5, { detail: dots([[x + 2.5, y + 3, 5]]) });
      }
    }
    const ruler = plan(-117, 74, 186, 7, 1);
    const ticks = k.topTicks(-111, 63, 6, 5, 74, 0.7, [2.3, 4.5], P);
    slab('ruler', ruler, 0, 0.7, { tone: 'lo', bevel: 0,
      detail: line(ticks.minor, 'lo') + line(ticks.major, 'mid') + dots([[-114, 78, 0.7], [66, 78, 0.7]], 0.38) });
    const label = plan(86, 67, 32, 15, 1.4);
    slab('blank-maker-plate', label, 0, 0.7, { tone: 'lo', bevel: 0,
      detail: outline(label, 0.7, 2) + dots([[89.5, 74.5, 0.7], [114.5, 74.5, 0.7]], 0.4) });
    for (const [n, [x, y]] of [[-128, -43], [-128, 35], [120, -43], [120, 35]].entries()) {
      slab(`fixture-lug-${n}`, plan(x, y, 8, 9, 1), 0, 3, { tone: 'mid' });
      fastener(`fixture-screw-${n}`, x + 4, y + 4.5, 3, 3);
    }
  }
  function aperture() {
    bed();
    for (let i = 0; i < 3; i++) {
      card(`source-${i}`, -99 + 70 * i, -38, 55, 70, 8, { code: 3 + i % 2 });
      slab(`index-tab-${i}`, plan(-90 + 70 * i, 32, 24, 7, 1), 8, 1.4, { tone: 'hi', detail: outline(plan(-90 + 70 * i, 32, 24, 7, 1), 9.4, 2) });
    }
    for (const [i, y] of [-48, 44].entries()) {
      for (const [j, x] of [-108, 98].entries()) slab(`rail-pedestal-${i}-${j}`, plan(x, y, 10, 5, 0.6), 8, 5);
      slab(`aperture-rail-${i}`, plan(-108, y, 216, 5, 0.8), 13, 3, { detail: dots([[-103, y + 2.5, 16], [103, y + 2.5, 16]]) });
    }
    const edges = state === 'a' ? [[-110, 79], [28, 78]] : [[-110, 9], [28, 78]];
    for (const [i, [x, w]] of edges.entries()) {
      for (const [j, y] of [-50, 44].entries()) {
        slab(`travel-shoe-${i}-${j}`, plan(x + Math.min(w - 9, 5), y, 9, 7, 1), 16, 3,
          { detail: dots([[x + Math.min(w - 9, 5) + 4.5, y + 3.5, 19]]) });
      }
      const leaf = plan(x, -43, w, 87, 1.5);
      slab(`aperture-leaf-${i}`, leaf, 16, 2.4, { tone: 'hi', lit: i === 0, detail: outline(leaf, 18.4, 2.5) });
    }
    const rx = edges[0][0];
    slab('operating-crossbar', plan(rx + 1, 51, Math.max(8, edges[0][1] - 2), 5, 0.8), 16, 3);
    slab('handle-neck', plan(rx + 3, 56, 6, 6, 0.6), 16, 3);
    slab('handle-grip', plan(rx, 62, 12, 6, 1.4), 15, 5,
      { detail: outline(plan(rx, 62, 12, 6, 1.4), 20, 1.5) });
    for (const [i, [x, y, w, d]] of [[-111, -39, 4, 78], [107, -39, 4, 78], [-107, 39, 214, 3]].entries())
      slab(`tray-stop-${i}`, plan(x, y, w, d, 0.5), 8, 3, { tone: 'lo' });
  }
  function commonFit() {
    bed();
    for (let i = 0; i < 3; i++) {
      const y = -39 + i * 29;
      const shift = i === 2 ? (state === 'a' ? -21 : 0) : 0;
      const notch = i === 2 ? 71 : 55;
      const x = -93 + shift;
      const end = 92 + shift;
      slab(`gauge-body-${i}`, plan(x, y, notch + shift - x, 20, 1), 8, 7,
        { tone: 'hi', detail: outline(plan(x + 8, y + 5, 35 + i * 6, 3, 1), 15, 0, 'lo') });
      slab(`gauge-web-${i}`, plan(notch + shift, y, 7, 20, 0), 8, 1, { tone: 'hi' });
      slab(`gauge-tip-${i}`, plan(notch + 7 + shift, y, end - notch - 7 - shift, 20, 1), 8, 7, { tone: 'hi' });
      slab(`tail-grip-${i}`, plan(x - 6, y + 3, 6, 14, 1), 8, 9,
        { detail: outline(plan(x - 6, y + 3, 6, 14, 1), 17, 1.5) });
      for (const [j, cy] of [y - 3, y + 20].entries()) {
        slab(`retaining-cheek-${i}-${j}`, plan(-104, cy, 203, 3, 0.4), 8, 1, { tone: 'lo' });
      }
      slab(`registration-block-${i}`, plan(99, y + 3, 8, 14, 0.8), 8, 9,
        { detail: dots([[103, y + 10, 17]]) });
    }
    // Joined key sections split the physical crossing at each gauge-bar edge.
    const stops = state === 'a' ? [-45, -42, -39, -19, -10, 10, 15] : [-45, -42, -39, -19, -10, 10, 19, 39, 44];
    for (let i = 0; i < stops.length - 1; i++) {
      const key = plan(55.7, stops[i], 5.6, stops[i + 1] - stops[i], 0);
      slab(`common-cross-key-${i}`, key, state === 'a' ? 9 : 15, 4, { tone: 'hi', lit: true, bevel: 0 });
    }
    for (const [i, x] of [48.7, 61.3].entries()) slab(`key-guide-${i}`, plan(x, -50, 7, 8, 0.8), 8, 10,
      { detail: dots([[x + 3.5, -46, 18]]) });
    for (const [i, y] of [-48, 42].entries()) {
      slab(`bridge-post-${i}`, plan(-109, y, 6, 6, 0.5), 8, 19);
      slab(`bridge-cap-${i}`, plan(-111, y - 1, 10, 8, 0.8), 27, 2,
        { detail: dots([[-106, y + 3, 29]]) });
    }
    slab('retaining-bridge', plan(-109, -42, 6, 84, 0.7), 23, 4);
    slab('key-travel-stop', plan(48, -52, 22, 2, 0.5), 8, 7, { tone: 'lo' });
  }
  function attribution() {
    bed();
    for (const [i, y] of [-43, -3, 37].entries()) {
      const rail = plan(-108, y, 216, 5, 0.7);
      slab(`sorting-rail-${i}`, rail, 8, 9, { detail: line(k.sideSeam(rail, 14, P, 4), 'faint') });
    }
    for (const [i, y] of [-38, 2].entries()) {
      slab(`lane-end-${i}`, plan(101, y, 7, 35, 0.8), 8, 9,
        { detail: dots([[104.5, y + 5, 17], [104.5, y + 30, 17]]) });
      slab(`loading-pad-${i}`, plan(-105, y + 4, 49, 27, 0.8), 8, 2, { tone: 'lo' });
      card(`source-slip-${i}`, -101, y + 6, 40, 23, 10, { code: 2 });
      slab(`source-tab-${i}`, plan(-99, y + 29, 14, 3, 0.7), 10, 1.4, { tone: 'hi' });
    }
    card('source-slip-2', -47, 8, 43, 25, 8, { code: 2 });
    slab('source-tab-2', plan(-42, 33, 16, 3, 0.7), 8, 1.4, { tone: 'hi' });
    for (const [i, [x, y]] of [[-108, -44], [94, -44], [-108, 36], [94, 36]].entries())
      slab(`rail-clamp-${i}`, plan(x, y, 12, 7, 0.8), 17, 2,
        { detail: dots([[x + 6, y + 3.5, 19]]) });
    const sy = state === 'a' ? -35 : 5;
    slab('sliding-saddle', plan(40, sy, 53, 28, 1.5), 8, 4, { tone: 'mid' });
    for (const [i, y] of [sy - 3, sy + 28].entries()) slab(`saddle-shoe-${i}`, plan(42, y, 49, 3, 0.5), 8, 6);
    card('attributed-card', 44, sy + 2, 45, 24, 12, { lit: true, code: 2 });
    for (const [i, x] of [54, 76].entries()) {
      slab(`role-pin-base-${i}`, plan(x, sy + 16, 8, 7, 0.7), 13.4, 1.2, { tone: 'hi' });
      slab(`role-key-${i}`, plan(x + (i ? 0 : 2.5), sy + 17.5, i ? 8 : 3, 4, 0.5), 14.6, i ? 3 : 9,
        { tone: 'hi', detail: dots([[x + 4, sy + 19.5, i ? 17.6 : 23.6]]) });
    }
    slab('saddle-pull-stem', plan(93, sy + 9, 4, 7, 0.8), 10, 3);
    slab('saddle-pull-grip', plan(97, sy + 5, 4, 15, 1), 9, 5);
  }
  function assembly() {
    bed();
    slab('receiving-plate', plan(-100, 29, 200, 13, 1), 8, 6,
      { detail: outline(plan(-100, 29, 200, 13, 1), 14, 2) });
    for (let i = 0; i < 3; i++) {
      const x = -94 + i * 66;
      const y = state === 'b' && i === 2 ? -53 : -33;
      slab(`loading-cradle-${i}`, plan(x - 1, -48, 57, 77, 1), 8, 2, { tone: 'lo' });
      for (const [j, cx] of [x - 5, x + 56].entries()) slab(`tongue-cheek-${i}-${j}`, plan(cx, -46, 4, 75, 0.7), 8, 8);
      card(`evidence-tongue-${i}`, x, y, 55, 62, 10, { lit: i === 2, h: 4, code: 3 + i });
      slab(`tongue-tail-grip-${i}`, plan(x + 15, y - 7, 25, 7, 1), 10, 7,
        { detail: outline(plan(x + 15, y - 7, 25, 7, 1), 17, 1.8) });
      slab(`tongue-key-${i}`, plan(x + 18, y + 56, 19, 6, 0.6), 14, 3, { tone: 'hi' });
    }
    const claspZ = state === 'a' ? 17 : 33;
    for (const [i, x] of [-111, 105].entries()) {
      slab(`clasp-post-${i}`, plan(x, 30, 6, 10, 0.7), 8, 35);
      slab(`clasp-cap-${i}`, plan(x - 1, 29, 8, 12, 1), 43, 2,
        { detail: dots([[x + 3, 35, 45]]) });
    }
    for (const [i, x] of [-105, 97].entries()) slab(`clasp-shoe-${i}`, plan(x, 30, 8, 10, 0.6), claspZ, 8);
    slab('common-clasp', plan(-97, 30, 194, 8, 1), claspZ, 6,
      { tone: 'hi', detail: outline(plan(-97, 30, 194, 8, 1), claspZ + 6, 2) });
  }
  function album() {
    bed();
    slab('album-cradle', plan(-111, -46, 222, 90, 2), 8, 3, { tone: 'lo' });
    slab('album-rear-fence', plan(-109, -47, 218, 4, 0.8), 11, 13);
    for (let i = 0; i < 3; i++) {
      const x = -101 + i * 68;
      slab(`page-bed-${i}`, plan(x, -38, 62, 74, 1), 11, 2, { tone: 'lo' });
      card(`paper-leaf-${i}`, x + 1, -37, 60, 72, 13, { lit: state === 'b' && i === 1, code: 3 });
      const bp = plan(x + 4, -43, 52, 5, 0.7);
      slab(`binding-slat-${i}`, bp, 11, 3.4, { detail: dots([[x + 10, -40.5, 14.4], [x + 49, -40.5, 14.4]]) });
      slab(`page-clamp-${i}`, plan(x + 19, -40, 24, 7, 0.7), 14.4, 2,
        { detail: dots([[x + 25, -36.5, 16.4], [x + 37, -36.5, 16.4]]) });
    }
    if (state === 'a') {
      card('shared-event-page', -100, -32, 196, 67, 14.4, { lit: true, code: 4, h: 1.5 });
      for (let i = 0; i < 3; i++) {
        const x = -79 + i * 65;
        slab(`participant-tab-${i}-foot`, plan(x, 29, 26, 13, 1), 15.9, 0.8, { tone: 'hi' });
        slab(`participant-tab-${i}-cap`, plan(x + 2, 34, 22, 8, 0.8), 16.7, 0.6, { tone: 'hi', detail: outline(plan(x + 2, 34, 22, 8, 0.8), 17.3, 1.5) });
      }
    } else {
      for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) {
        const x = -98 + i * 68 + j * 29;
        slab(`participant-tab-${i}-${j}`, plan(x, 29, 23, 13, 1), 14.4, 1,
          { tone: 'hi', detail: outline(plan(x, 29, 23, 13, 1), 15.4, 2) });
      }
    }
    for (const [i, [x, y]] of [[-116, -45], [109, -45], [-116, 36], [109, 36]].entries())
      slab(`album-retaining-corner-${i}`, plan(x, y, 7, 9, 0.7), 11, 7,
        { detail: dots([[x + 3.5, y + 4.5, 18]]) });
    for (const [i, y] of [-16, 22].entries()) slab(`binding-cheek-${i}`, plan(-113, y, 8, 9, 0.8), 11, 8);
    slab('album-clasp', plan(-113, -7, 6, 29, 0.8), 14, 5, { tone: 'hi' });
    for (const [i, y] of [-9, 20].entries()) slab(`album-clasp-shoe-${i}`, plan(-114, y, 8, 4, 0.7), 19, 2,
      { detail: dots([[-110, y + 2, 21]]) });
  }
  function checkingPress() {
    bed();
    const marks = [];
    for (let i = 0; i < 2; i++) {
      const x = -98 + i * 107;
      slab(`slip-bed-${i}`, plan(x, -34, 89, 73, 1.6), 8, 4, { tone: 'lo' });
      card(`comparison-slip-${i}`, x + 3, -29, 83, 63, 12, { lit: i === 1, code: 2, h: 1.5 });
      slab(`slip-stop-${i}`, plan(x, -38, 89, 4, 0.5), 8, 9,
        { detail: dots([[x + 6, -36, 17], [x + 83, -36, 17]]) });
      for (let n = 0; n < 3; n++) {
        const mx = x + 14 + n * 20;
        const shifted = state === 'b' && i === 1 && n === 1 ? 9 : 0;
        slab(`impression-${i}-${n}`, plan(mx + shifted, -6, 9, 15, 0.5), 13.5, 5, { tone: 'hi',
          detail: outline(plan(mx + shifted, -6, 9, 15, 0.5), 18.5, 1.8) });
        marks.push({ x: mx + 9, y: -6 });
      }
    }
    const bridgeZ = state === 'a' ? 21 : 43;
    for (const [i, [x, y]] of [[-112, -42], [106, -42], [-112, 37], [106, 37]].entries()) {
      slab(`pillar-foot-${i}`, plan(x - 3, y - 3, 12, 13, 1), 8, 5,
        { detail: dots([[x - 1, y + 3.5, 13], [x + 7, y + 3.5, 13]]) });
      slab(`guide-pillar-${i}`, plan(x, y, 6, 7, 0.7), 13, 49,
        { detail: line(k.sideSeam(plan(x, y, 6, 7, 0.7), 55, P, 4)) });
      // Shoes touch each pillar's inward face, without drawing through it.
      const sx = x < 0 ? -106 : 100;
      slab(`press-guide-shoe-${i}`, plan(sx, y, 6, 7, 0.5), bridgeZ, 7);
    }
    // Side rails and the main bridge form a rigid H-frame.
    for (const [i, x] of [-106, 100].entries()) slab(`bridge-side-rail-${i}`, plan(x, -35, 6, 72, 0.7), bridgeZ, 7);
    slab('checking-bridge', plan(-100, -11, 200, 25, 1.3), bridgeZ, 7,
      { tone: 'hi', detail: outline(plan(-100, -11, 200, 25, 1.3), bridgeZ + 7, 2.8) });
    for (const [i, m] of marks.entries()) slab(`checking-tooth-${i}`, plan(m.x, m.y, 6, 15, 0.4), bridgeZ - 7.5, 7.5, { tone: 'mid' });
    slab('seal-shoe', plan(-18, -8, 36, 19, 1), bridgeZ + 7, 2, { tone: 'mid' });
    slab('seal-block', plan(-13, -4, 26, 11, 1), bridgeZ + 9, 5,
      { tone: 'hi', detail: outline(plan(-13, -4, 26, 11, 1), bridgeZ + 14, 2) });
  }

  commonBench();
  ({ '01': aperture, '02': commonFit, '03': attribution, '04': assembly, '05': album, '06': checkingPress })[id]();
  const sorted = paintOrder(parts);
  const shadow = `<path class="iso-halo" d="${k.haloOf(BASE, -19, 2, P)}"/>`;
  return { count: parts.length, names: parts.map(p => p.name), ordering: sorted.report,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" class="iso-svg memory-instrument" viewBox="0 0 ${WIDTH} ${HEIGHT}" aria-hidden="true" focusable="false" data-scene="${id}" data-state="${state}" data-solid-count="${parts.length}">${shadow}${sorted.parts.map(p => p.svg).join('')}</svg>` };
}

// Axis-aligned slabs are ordered by actual sampled visibility, not by a tuned
// layer key. A ray sees the nearest surface of each box; rounded corners are
// excluded. Topological sorting preserves every unambiguous overlap constraint.
function paintOrder(parts) {
  const cam = k.cameraOf(P);
  const u = [cam.sinA, -cam.cosA, 0];
  const v = [cam.cosA * cam.sinE, cam.sinA * cam.sinE, -cam.cosE];
  const ray = [cam.cosA * cam.cosE, cam.sinA * cam.cosE, cam.sinE];
  const geom = parts.map(part => {
    const { p, z, h } = part;
    const xy = k.boxCorners(p, z, z + h).map(point => k.iso(point, P));
    return { lo: [p.x, p.y, z], hi: [p.x + p.w, p.y + p.d, z + h],
      box: [Math.min(...xy.map(t => t[0])), Math.min(...xy.map(t => t[1])), Math.max(...xy.map(t => t[0])), Math.max(...xy.map(t => t[1]))],
      depth: k.depthOf([p.x + p.w / 2, p.y + p.d / 2, z + h / 2], P), p };
  });
  function hit(g, sx, sy) {
    const a = (sx - P.origin[0]) / cam.k;
    const b = (sy - P.origin[1]) / cam.k;
    const o = u.map((q, n) => q * a + v[n] * b);
    let enter = -Infinity, leave = Infinity;
    for (let n = 0; n < 3; n++) {
      enter = Math.max(enter, (g.lo[n] - o[n]) / ray[n]);
      leave = Math.min(leave, (g.hi[n] - o[n]) / ray[n]);
    }
    if (enter > leave - 0.015) return null;
    const x = o[0] + ray[0] * leave, y = o[1] + ray[1] * leave;
    const r = g.p.r;
    const dx = Math.max(g.p.x + r - x, 0, x - (g.p.x + g.p.w - r));
    const dy = Math.max(g.p.y + r - y, 0, y - (g.p.y + g.p.d - r));
    return dx * dx + dy * dy > r * r + 0.01 ? null : leave;
  }
  const edges = parts.map(() => new Set());
  const incoming = parts.map(() => 0);
  const mixed = [];
  const intersections = [];
  const contacts = parts.map(() => new Set());
  let constraints = 0;
  for (let a = 0; a < parts.length; a++) for (let b = a + 1; b < parts.length; b++) {
    const ga = geom[a], gb = geom[b];
    const overlap = [0, 1, 2].map(n => Math.min(ga.hi[n], gb.hi[n]) - Math.max(ga.lo[n], gb.lo[n]));
    if (overlap.every(n => n > 0.15)) intersections.push([parts[a].name, parts[b].name]);
    if (overlap.every(n => n >= -0.05) && overlap.filter(n => n > 0.15).length >= 2) {
      contacts[a].add(b); contacts[b].add(a);
    }
    const x0 = Math.max(ga.box[0], gb.box[0]), y0 = Math.max(ga.box[1], gb.box[1]);
    const x1 = Math.min(ga.box[2], gb.box[2]), y1 = Math.min(ga.box[3], gb.box[3]);
    if (x1 - x0 < 0.2 || y1 - y0 < 0.2) continue;
    let frontA = 0, frontB = 0;
    const stepsX = Math.max(2, Math.ceil((x1 - x0) / 4));
    const stepsY = Math.max(2, Math.ceil((y1 - y0) / 4));
    for (let x = 0; x < stepsX; x++) for (let y = 0; y < stepsY; y++) {
      const sx = x0 + (x + 0.5) * (x1 - x0) / stepsX;
      const sy = y0 + (y + 0.5) * (y1 - y0) / stepsY;
      const ha = hit(ga, sx, sy), hb = hit(gb, sx, sy);
      if (ha === null || hb === null || Math.abs(ha - hb) < 0.08) continue;
      if (ha > hb) frontA++; else frontB++;
    }
    if (frontA && frontB) mixed.push([parts[a].name, parts[b].name]);
    if (!frontA && !frontB) continue;
    const [back, front] = frontA >= frontB ? [b, a] : [a, b];
    edges[back].add(front); incoming[front]++; constraints++;
  }
  const todo = new Set(parts.map((_, n) => n));
  const sorted = [];
  let cycles = 0;
  const cycleParts = [];
  while (todo.size) {
    let options = [...todo].filter(n => incoming[n] === 0);
    if (!options.length) {
      cycles++; options = [...todo];
      if (!cycleParts.length) cycleParts.push(...options.flatMap(n => [...edges[n]].filter(m => todo.has(m)).map(m => [parts[n].name, parts[m].name])));
    }
    options.sort((a, b) => geom[a].depth - geom[b].depth);
    const n = options[0];
    sorted.push(parts[n]); todo.delete(n);
    for (const after of edges[n]) incoming[after]--;
  }
  const supported = new Set(parts.map((p, n) => p.name.startsWith('foot-pad-') ? n : -1).filter(n => n >= 0));
  const queue = [...supported];
  for (let n = 0; n < queue.length; n++) for (const neighbour of contacts[queue[n]]) {
    if (!supported.has(neighbour)) { supported.add(neighbour); queue.push(neighbour); }
  }
  const unsupported = parts.filter((_, n) => !supported.has(n)).map(p => p.name);
  return { parts: sorted, report: { constraints, mixed, intersections, unsupported, cycles, cycleParts } };
}

const prepared = Object.fromEntries(Object.keys(sceneDescriptions).map(id => [id,
  Object.fromEntries(['a', 'b'].map(state => [state, scene(id, state)]))]));

export const partCounts = Object.freeze(Object.fromEntries(Object.entries(prepared).map(([id, states]) =>
  [id, Object.freeze(Object.fromEntries(Object.entries(states).map(([state, result]) => [state, result.count])))])));
export const geometryChecks = Object.freeze(Object.fromEntries(Object.entries(prepared).map(([id, states]) =>
  [id, Object.fromEntries(Object.entries(states).map(([state, result]) => [state, result.ordering]))])));

export function renderInstrument(id, state = 'a') {
  const key = String(id).padStart(2, '0');
  if (!prepared[key] || !prepared[key][state]) throw new RangeError(`Unknown instrument configuration: ${id}/${state}`);
  return prepared[key][state].svg;
}
