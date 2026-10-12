// Research-only demonstrations. Nothing registers with Circadian's lifecycle.
export const proposals = [
  { id: '01', directory: '01-views', spec: '01-coordinated-memory-views.md', name: 'Coordinated views' },
  { id: '02', directory: '02-compatibility', spec: '02-contextual-compatibility.md', name: 'Contextual compatibility' },
  { id: '03', directory: '03-relations', spec: '03-typed-relations-and-composition.md', name: 'Typed relations' },
  { id: '04', directory: '04-operations', spec: '04-reusable-multi-input-operations.md', name: 'Reusable operations' },
  { id: '05', directory: '05-experiences', spec: '05-joint-experiences-and-interpretations.md', name: 'Joint experiences' },
  { id: '06', directory: '06-transformations', spec: '06-checked-memory-transformations.md', name: 'Checked transformations' },
] as const;

export async function runDemonstrations(selected: readonly string[] = proposals.map(p => p.id)) {
  const ids = new Set(selected);
  for (const id of ids) {
    if (!proposals.some(p => p.id === id)) throw new Error(`Unknown proposal: ${id}`);
  }
  const demonstrations = [];
  for (const proposal of proposals) {
    if (!ids.has(proposal.id)) continue;
    const { demo } = await import(`./${proposal.directory}/demo.ts`);
    demonstrations.push({ id: proposal.id, name: proposal.name, result: demo() });
  }
  return { scope: 'isolated research fixtures', inferenceCalls: 0, demonstrations };
}

if (import.meta.main) {
  try {
    const args = process.argv.slice(2);
    if (args.length !== 0 && (args.length !== 2 || args[0] !== '--only' || !args[1])) {
      throw new Error('Usage: bun research/prototypes/run.ts [--only 01,02 | --only none]');
    }
    const selected = args.length === 0 ? undefined : args[1] === 'none' ? [] : args[1].split(',');
    console.log(JSON.stringify(await runDemonstrations(selected), null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
