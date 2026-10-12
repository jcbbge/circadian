import { expect, test } from 'bun:test';
import { auditCaseCoverage } from './coverage.ts';
import { proposals, runDemonstrations } from './run.ts';

test('All six demonstrations run independently and together without inference', async () => {
  const together = await runDemonstrations();
  expect(together.inferenceCalls).toBe(0);
  expect(together.demonstrations.map(d => d.id)).toEqual(proposals.map(p => p.id));
  for (const proposal of proposals) {
    const alone = await runDemonstrations([proposal.id]);
    expect(alone.demonstrations).toEqual(together.demonstrations.filter(d => d.id === proposal.id));
  }
});

test('Disabled proposals produce no demonstration; selection never expands silently', async () => {
  expect((await runDemonstrations([])).demonstrations).toEqual([]);
  expect((await runDemonstrations(['01', '06', '01'])).demonstrations.map(d => d.id)).toEqual(['01', '06']);
  await expect(runDemonstrations(['07'])).rejects.toThrow('Unknown proposal');
});

test('Every refined specification case has a unique executable or deferred mapping', () => {
  const reports = auditCaseCoverage();
  expect(reports).toHaveLength(6);
  expect(reports.flatMap(report => report.cases)).toHaveLength(93);
});
