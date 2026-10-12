import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { createExhibits } from './model.ts';
import { renderInstrument, partCounts, geometryChecks } from './instrument.mjs';
import { ISO_CSS } from './vendor/anatomy/iso-kit.mjs';

const here = import.meta.dir;
const directories = ['01-views', '02-compatibility', '03-relations', '04-operations', '05-experiences', '06-transformations'];
const read = (p: string) => readFileSync(join(here, p), 'utf8');
const hash = (p: string) => createHash('sha256').update(read(p)).digest('hex');
const exhibits = createExhibits().map((x, i) => ({ ...x, directory: directories[i] }));
const rendered = exhibits.map(x => ({ ...x, states: x.states.map(s => ({ ...s, svg: renderInstrument(x.id, s.key) })) }));
for (const x of rendered) for (const s of x.states) {
  if (!s.svg.includes('<svg') || /NaN|undefined|Infinity/.test(s.svg)) throw Error(`Invalid geometry ${x.id}/${s.key}`);
  const count = (s.svg.match(/data-part=/g) ?? []).length;
  if (count < 40 || count > 80) throw Error(`Figure part budget: ${x.id}/${s.key} = ${count}`);
  const check = geometryChecks[x.id][s.key];
  if (check.intersections.length || check.unsupported.length || check.mixed.length || check.cycles) {
    throw Error(`Geometry audit failed: ${x.id}/${s.key}`);
  }
}
const data = JSON.stringify(rendered).replace(/</g, '\\u003c');
const html = read('page.html').replace('/*__STYLES__*/', () => ISO_CSS + '\n' + read('style.css'))
  .replace('/*__DATA__*/', () => data).replace('/*__APP__*/', () => read('app.js'));
if (/\/\*__(STYLES|DATA|APP)__\*\//.test(html)) throw Error('Unfilled page slot');
writeFileSync(join(here, 'index.html'), html);
writeFileSync(join(here, 'exhibits.json'), JSON.stringify(exhibits, null, 2) + '\n');
const sourceFiles = ['model.ts', 'instrument.mjs', 'page.html', 'style.css', 'app.js', 'build.ts', 'vendor/anatomy/iso-kit.mjs'];
for (const dir of directories) sourceFiles.push(`../prototypes/${dir}/index.ts`, `../prototypes/${dir}/fixtures.ts`);
writeFileSync(join(here, 'BUILD.json'), JSON.stringify({
  purpose: 'Standalone visual explanation; comparisons replay calls to the real prototype functions.',
  figures: rendered.length, capturedCases: rendered.reduce((n, x) => n + x.states.length, 0), partCounts, geometryChecks,
  inferenceCalls: 0, liveMemoryReads: 0, sourceHashes: Object.fromEntries(sourceFiles.map(p => [p, hash(p)])),
  outputHashes: { 'index.html': hash('index.html'), 'exhibits.json': hash('exhibits.json') },
  prototypeValidation: JSON.parse(read('../prototypes/results.json')).validated_at_utc,
}, null, 2) + '\n');
console.log(JSON.stringify({ figures: rendered.length, states: rendered.reduce((n,x) => n + x.states.length, 0), htmlBytes: Buffer.byteLength(html), inferenceCalls: 0 }));
