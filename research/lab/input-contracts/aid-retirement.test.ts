import { expect, test } from 'bun:test';
import { fixture } from '../../prototypes/04-operations/fixtures';
import { instantiate, plan, retireAid } from '../../prototypes/04-operations';

test('retiring a derived aid preserves original inputs, sources and ordinary planning', () => {
  const { aid, inputs, states, asOf } = fixture();
  const before = structuredClone({ aid, inputs, states });
  const ordinary = plan(inputs, states, asOf);
  const retired = retireAid(aid);
  expect(retired).not.toBe(aid);
  expect(retired.bindings).toEqual(aid.bindings);
  expect(instantiate(retired, inputs, states, asOf, 'applies')).toEqual({ status: 'notApplicable', reason: 'retired' });
  expect({ aid, inputs, states }).toEqual(before);
  expect(plan(inputs, states, asOf)).toEqual(ordinary);
  expect(ordinary).toHaveProperty('status', 'result');
});
