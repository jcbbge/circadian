// Decision-only transport for bounded, fixed-choice questions. The endpoint
// speaks JSON: POST { question, options, evidence } -> { option, confidence? }.
// Confidence is intentionally ignored in v1. A configured endpoint never
// silently falls back to generation: a bad response must be visible as degraded.
// With no endpoint, the caller's existing generative prompt is used unchanged.

export interface DecisionRequest<T extends string> {
  question: string;
  options: readonly T[];
  evidence: unknown;
}

export interface DecisionResult<T extends string> {
  option: T;
  valid: boolean;
  /** Raw choice for audit logs; never interpreted as model prose. */
  raw: string;
}

export interface DecisionTransport {
  (request: DecisionRequest<string>): Promise<unknown>;
}

export interface DecideOptions {
  /** Old generative call, including its original prompt and request settings. */
  fallback: () => Promise<string>;
  /** Tests and local adapters can supply a transport without an HTTP service. */
  transport?: DecisionTransport;
  /** When omitted, CIRCADIAN_DECIDE_URL selects the HTTP decision transport. */
  endpoint?: string;
}

const TIMEOUT_MS = 60_000;

export async function endpointDecision(request: DecisionRequest<string>, url: string): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(process.env.CIRCADIAN_DECIDE_API_KEY ? { Authorization: `Bearer ${process.env.CIRCADIAN_DECIDE_API_KEY}` } : {}),
      },
      body: JSON.stringify(request),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`decision endpoint HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

/** Invalid responses (including transport failures) default to DISTINCT,
 * with valid:false so the stacker's existing degraded event counts them.
 * DISTINCT must be among options: no unsafe default for other question types. */
export async function decide<T extends string>(
  request: DecisionRequest<T>,
  opts: DecideOptions,
): Promise<DecisionResult<T>> {
  if (!request.options.includes("DISTINCT" as T)) throw new Error("decision requires a DISTINCT safe default");
  let answer: unknown;
  try {
    const endpoint = opts.endpoint ?? process.env.CIRCADIAN_DECIDE_URL;
    answer = opts.transport
      ? await opts.transport(request)
      : endpoint ? await endpointDecision(request, endpoint) : await opts.fallback();
  } catch (error) {
    answer = `(COMPARE call failed: ${error instanceof Error ? error.message : String(error)})`;
  }
  const raw = typeof answer === "string" ? answer :
    answer !== null && typeof answer === "object" && "option" in answer && typeof answer.option === "string"
      ? answer.option : JSON.stringify(answer) ?? String(answer);
  const normalized = raw.trim().toUpperCase();
  const option = request.options.find((choice) => choice === normalized);
  return { option: option ?? ("DISTINCT" as T), valid: option !== undefined, raw };
}
