import { test, expect } from "bun:test";
import { decide } from "./decide.ts";

const pair = {
  question: "Compare beliefs",
  options: ["SAME", "DISTINCT", "SUPERSEDES_A", "SUPERSEDES_B"] as const,
  evidence: { A: "a claim", B: "another claim" },
};

test("no endpoint uses the unchanged fallback choice (case/whitespace folded)", async () => {
  let called = 0;
  const result = await decide(pair, { endpoint: "", fallback: async () => { called++; return " supersedes_b\n"; } });
  expect(result).toEqual({ option: "SUPERSEDES_B", valid: true, raw: " supersedes_b\n" });
  expect(called).toBe(1);
});

test("configured transport receives bounded evidence, ignores confidence, never generates", async () => {
  let called = 0;
  const result = await decide(pair, {
    fallback: async () => { called++; return "SAME"; },
    transport: async request => {
      expect(request).toEqual(pair);
      return { option: "SUPERSEDES_A", confidence: 0.01 };
    },
  });
  expect(result).toEqual({ option: "SUPERSEDES_A", valid: true, raw: "SUPERSEDES_A" });
  expect(called).toBe(0);
});

test("malformed or failed transport is DISTINCT and invalid, not a generative failover", async () => {
  for (const transport of [
    async () => ({ option: "SAME." }),
    async () => ({ choice: "SAME" }),
    async () => { throw new Error("offline"); },
  ]) {
    const result = await decide(pair, { fallback: async () => { throw new Error("fallback called"); }, transport });
    expect(result.option).toBe("DISTINCT");
    expect(result.valid).toBe(false);
  }
});

test("without a safe default refuses other question shapes", async () => {
  expect(decide({ question: "?", options: ["YES", "NO"], evidence: {} }, {
    fallback: async () => "YES",
  })).rejects.toThrow("DISTINCT");
});
