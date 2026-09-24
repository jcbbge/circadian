// Offline compare benchmark. The caller supplies recorded A/B pairs and both
// transports; it never reads the live mind or chooses an inference service.
import { decide, type DecisionTransport } from "./decide.ts";
import { ok, degraded } from "./obs.ts";
import { buildComparePrompt, parseCompareToken } from "./stack.ts";

export interface ComparePair { A: string; B: string }

export async function measureCompare(
  pairs: readonly ComparePair[],
  oldCompare: (prompt: string) => Promise<string>,
  transport: DecisionTransport,
) {
  if (!pairs.length) throw new Error("COMPARE measurement requires recorded pairs");
  let agreements = 0;
  let invalid = 0;
  let oldMs = 0;
  let newMs = 0;
  for (const { A, B } of pairs) {
    const startOld = performance.now();
    const old = parseCompareToken(await oldCompare(buildComparePrompt(A, B)));
    oldMs += performance.now() - startOld;
    const startNew = performance.now();
    const fresh = await decide({
      question: "Compare two candidate beliefs. SAME: same belief; DISTINCT: different beliefs; SUPERSEDES_A: A replaces B; SUPERSEDES_B: B replaces A.",
      options: ["SAME", "DISTINCT", "SUPERSEDES_A", "SUPERSEDES_B"],
      evidence: { A, B },
    }, { fallback: async () => { throw new Error("decision transport required"); }, transport });
    newMs += performance.now() - startNew;
    if (!old.valid || !fresh.valid) invalid++;
    if (old.valid && fresh.valid && old.token === fresh.option) agreements++;
  }
  const agreement = agreements / pairs.length;
  const speedup = newMs === 0 ? 0 : oldMs / newMs;
  const result = { pairs: pairs.length, agreements, invalid, agreement, oldMsPerCall: oldMs / pairs.length,
    decisionMsPerCall: newMs / pairs.length, speedup };
  const accepted = invalid === 0 && agreement >= 0.95 && speedup >= 10;
  (accepted ? ok : degraded)({ process: "stack", phase: "compare-measure", summary: "COMPARE decision transport benchmark",
    context: result,
    ...(!accepted ? { cause: "invalid choices, agreement below 95%, or decision transport slower than 10x",
      next_action: "inspect recorded pairs and endpoint; do not promote decision transport until measured thresholds pass" } : {}),
  });
  return { ...result, accepted };
}
