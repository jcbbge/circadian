import { expect, test } from "bun:test";
import { llmApiKey } from "./env.ts";

test("explicit key wins, proxy token pair joins with a dot, legacy local key last", () => {
  expect(llmApiKey({ CIRCADIAN_LLM_API_KEY: "k", MODAL_PROXY_TOKEN_ID: "wk-a", MODAL_PROXY_TOKEN_SECRET: "ws-b" })).toBe("k");
  expect(llmApiKey({ MODAL_PROXY_TOKEN_ID: "wk-a", MODAL_PROXY_TOKEN_SECRET: "ws-b" })).toBe("wk-a.ws-b");
  expect(llmApiKey({ MODAL_PROXY_TOKEN_ID: "wk-a" })).toBe("local");
  expect(llmApiKey({ LOCAL_LLM_API_KEY: "l" })).toBe("l");
});
