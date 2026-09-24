import { test, expect } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { measureCompare } from "./decide-measure.ts";

test("recorded-pair benchmark measures both transports and emits a context-bound obs event", async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "circ-measure-"));
  const prior = process.env.CIRCADIAN_HOME;
  process.env.CIRCADIAN_HOME = home;
  try {
    const pairs = Array.from({ length: 20 }, (_, i) => ({ A: `claim ${i}`, B: `other ${i}` }));
    const result = await measureCompare(pairs,
      async prompt => { expect(prompt).toContain("SUPERSEDES_A"); await Bun.sleep(12); return "SAME"; },
      async request => { expect(request.evidence).toHaveProperty("A"); return { option: "SAME", confidence: 0 }; },
    );
    expect(result.pairs).toBe(20);
    expect(result.agreement).toBe(1);
    expect(result.speedup).toBeGreaterThan(10);
    expect(result.accepted).toBe(true);
    const event = JSON.parse(fs.readFileSync(path.join(home, "logs", "circadian.events.jsonl"), "utf8").trim());
    expect(event.phase).toBe("compare-measure");
    expect(event.context.agreement).toBe(1);
  } finally {
    if (prior === undefined) delete process.env.CIRCADIAN_HOME;
    else process.env.CIRCADIAN_HOME = prior;
    fs.rmSync(home, { recursive: true, force: true });
  }
});
