import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { proposals } from './run.ts';

export interface CaseMapping {
  id: string;
  status: 'deterministic' | 'deferred-behavioral';
  test: string | null;
  note: string;
}

// This audits specification coverage, not semantic truth or code-line coverage.
export function auditCaseCoverage() {
  return proposals.map(proposal => {
    const specification = readFileSync(join(import.meta.dir, '../refinements', proposal.spec), 'utf8');
    const ids = [...specification.matchAll(/^\| ([A-Z]\d{2}) \|/gm)].map(match => match[1]);
    const directory = join(import.meta.dir, proposal.directory);
    const cases: CaseMapping[] = JSON.parse(readFileSync(join(directory, 'coverage.json'), 'utf8'));
    const tests = readFileSync(join(directory, 'index.test.ts'), 'utf8');
    if (!Array.isArray(cases) || cases.length !== ids.length || new Set(cases.map(c => c.id)).size !== ids.length) {
      throw new Error(`${proposal.id}: incomplete or duplicate case mapping`);
    }
    for (const id of ids) {
      const entry = cases.find(c => c.id === id);
      if (!entry || !entry.note?.trim()) throw new Error(`${id}: missing case or explanation`);
      if (entry.status === 'deterministic') {
        if (!entry.test?.startsWith(`${id} `) || !tests.includes(`${id} `)) {
          throw new Error(`${id}: missing named executable test`);
        }
      } else if (entry.status !== 'deferred-behavioral' || entry.test !== null) {
        throw new Error(`${id}: invalid coverage status`);
      }
    }
    return { id: proposal.id, name: proposal.name, cases };
  });
}

if (import.meta.main) console.log(JSON.stringify(auditCaseCoverage(), null, 2));
