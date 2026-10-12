import { describe, expect, test } from "bun:test";
import { assemble, DEFAULT_LIMITS, instantiate, matchPlace, overlap, plan, retireAid, type Aid, type Options, type Result, type Slots, type Windows } from "./index";
import { expectedEvidence, expectedSuggestion, fixture, ref } from "./fixtures";
const complement = (inputs: ReturnType<typeof fixture>["inputs"]): Partial<Slots> => ({ availability: inputs.availability, places: inputs.places, intention: inputs.intention });

describe("04 reusable multi-input operations", () => {
  test("R01 produce the exact tentative source-backed afternoon", () => {
    const { aid, inputs, states, asOf } = fixture();
    const result = instantiate(aid, complement(inputs), states, asOf, "applies") as Result;
    expect(result.status).toBe("result"); expect(result.options).toEqual(expectedSuggestion);
    expect(result.evidence.map(s => s.id)).toEqual(expectedEvidence); expect(result.reasons).toEqual([]);
    expect(result).toEqual(plan(inputs, states, asOf));
  });
  test("R02 missing Noor availability never invents an interval", () => {
    const { aid, inputs, states, asOf } = fixture(); inputs.availability = inputs.availability.slice(0, 1);
    expect(instantiate(aid, complement(inputs), states, asOf, "applies")).toEqual({ status: "missing", slots: ["Noor.availability"] });
  });
  test("R03 reject a preference bound to a different participant", () => {
    const { aid, inputs, states, asOf } = fixture(); aid.bindings.preferences![0]!.participant = "Dana";
    expect(instantiate(aid, complement(inputs), states, asOf, "applies")).toEqual({ status: "reconsider", reason: "bindingMismatch", binding: "Dana.preferences" });
  });
  test("R04 superseded ineligible or changed bindings need reconsideration", () => {
    for (const [update, reason] of [[{ superseded: true }, "staleSource"], [{ eligible: false }, "ineligibleSource"], [{ revision: "v2" }, "staleSource"]] as const) {
      const { aid, inputs, states, asOf } = fixture(); states["p-mira"] = { ...states["p-mira"]!, ...update };
      expect(instantiate(aid, complement(inputs), states, asOf, "applies")).toEqual({ status: "reconsider", reason, binding: "Mira.preference" });
    }
  });
  test("R05 shared evidence across branches is not double counted", () => {
    const { inputs, states, asOf } = fixture(); inputs.preferences[0]!.source = ref("a-mira");
    const result = plan(inputs, states, asOf) as Result;
    expect(result.options).toEqual(expectedSuggestion);
    expect(result.evidence.filter(s => s.id === "a-mira")).toHaveLength(1);
    expect(result.evidence).toHaveLength(5);
  });
  test("R06 preference residual equals full application across three completions", () => {
    const outputs = [expectedSuggestion, [], [{ place: "H", window: [90, 105], tentative: true }]];
    for (let variant = 0; variant < 3; variant++) {
      const { aid, inputs, states, asOf } = fixture();
      if (variant === 1) inputs.availability[1]!.windows = [[115, 150]];
      if (variant === 2) { inputs.places[0]!.quiet = false; inputs.places.push({ id: "H", quiet: true, seating: true, open: true, source: ref("h") }); }
      const result = instantiate(aid, complement(inputs), states, asOf, "applies") as Result;
      expect(result.status).toBe("result"); expect(result.options).toEqual(outputs[variant]);
      expect(result).toEqual(plan(inputs, states, asOf));
      if (variant === 1) expect(result.reasons).toContain("noFeasibleWindow");
    }
  });
  test("R07 only windows can substitute into the windows slot", () => {
    const { inputs, asOf } = fixture();
    const windows = overlap(inputs.availability) as Windows;
    const places = matchPlace(inputs.preferences, inputs.places) as Options;
    expect((assemble(windows, places, inputs.intention, asOf) as Result).options).toEqual(expectedSuggestion);
    expect(assemble(places, places, inputs.intention, asOf)).toEqual({ status: "unsupported", reason: "typeMismatch", detail: "windows/options" });
  });
  test("R08 pure identity and grouping preserve result and evidence", () => {
    const { inputs, asOf } = fixture(); const identity = <T>(value: T) => value;
    const grouped = () => ({ windows: overlap(inputs.availability) as Windows, places: matchPlace(inputs.preferences, inputs.places) as Options });
    const pair = grouped();
    const first = assemble(identity(pair.windows), identity(pair.places), inputs.intention, asOf);
    const second = ((windows: Windows) => assemble(windows, matchPlace(inputs.preferences, inputs.places) as Options, inputs.intention, asOf))(overlap(inputs.availability) as Windows);
    expect(first).toEqual(second); expect((first as Result).options).toEqual(expectedSuggestion);
  });
  test("R09 supplied time makes computation deterministic without input mutation", () => {
    const { aid, inputs, states, asOf } = fixture();
    const before = structuredClone({ aid, inputs, states });
    const originalNow = Date.now;
    let first, second;
    try {
      Date.now = () => 1; first = instantiate(aid, complement(inputs), states, asOf, "applies");
      Date.now = () => 9_000_000_000; second = instantiate(aid, complement(inputs), states, asOf, "applies");
    } finally { Date.now = originalNow; }
    expect(first).toEqual(second); expect({ aid, inputs, states }).toEqual(before);
    expect(Object.hasOwn(aid, "usage")).toBe(false);
  });
  test("R10 temporary inapplicability does not retire the aid", () => {
    const { aid, inputs, states, asOf } = fixture();
    expect(instantiate(aid, complement(inputs), states, asOf, "doesNotApply")).toEqual({ status: "notApplicable", reason: "reviewedContext" });
    expect((instantiate(aid, complement(inputs), states, asOf, "applies") as Result).options).toEqual(expectedSuggestion);
    expect(aid.retired).toBeUndefined();
    expect(instantiate(aid, complement(inputs), states, asOf, "unknown")).toEqual({ status: "missing", slots: ["applicabilityEvidence"] });
  });
  test("R11 invalid conditions and retirement are separate from deleting experience", () => {
    const { aid, inputs, states, asOf } = fixture();
    const boundPlace: Aid = { ...aid, bindings: { ...aid.bindings, places: inputs.places } };
    states.g!.validity = "invalid";
    const supplied = { availability: inputs.availability, intention: inputs.intention };
    expect(instantiate(boundPlace, supplied, states, asOf, "applies")).toEqual({ status: "reconsider", reason: "invalidCondition", binding: "place:G" });
    expect(boundPlace.retired).toBeUndefined();
    const retired = retireAid(boundPlace);
    expect(instantiate(retired, supplied, states, asOf, "applies")).toEqual({ status: "notApplicable", reason: "retired" });
    expect(retired.bindings).toEqual(boundPlace.bindings); expect(states.g!.available).toBe(true);
    expect(aid.retired).toBeUndefined();
  });
  test("R12 deleted required source prevents stale binding reuse", () => {
    const { aid, inputs, states, asOf } = fixture(); delete states["p-mira"];
    expect(instantiate(aid, complement(inputs), states, asOf, "applies")).toEqual({ status: "reconsider", reason: "unavailableSource", binding: "Mira.preference" });
    // Live deletion of aid labels/text is intentionally not claimed by this fixture-only API.
  });
  test("R13 record cap rejects before inspecting the excess population", () => {
    const { inputs, states, asOf } = fixture();
    inputs.places = Array.from({ length: 16 }, (_, i) => ({ ...inputs.places[0]!, id: `G${i}` }));
    let touched = false;
    Object.defineProperty(inputs.places, 0, { get() { touched = true; throw new Error("composition began before cap"); } });
    // 2 preferences + 2 availability + 16 places + 1 intention = 21 records.
    expect(plan(inputs, states, asOf, "applies", { ...DEFAULT_LIMITS, records: 20 })).toEqual({ status: "unsupported", reason: "limit", detail: "records" });
    expect(touched).toBe(false);
  });
  test("R15 distinct specializations equal the same full application", () => {
    const { aid, inputs, states, asOf } = fixture();
    const availabilityAid: Aid = { ...aid, bindings: { availability: inputs.availability } };
    const first = instantiate(aid, complement(inputs), states, asOf, "applies");
    const second = instantiate(availabilityAid, { preferences: inputs.preferences, places: inputs.places, intention: inputs.intention }, states, asOf, "applies");
    expect(first).toEqual(second); expect(second).toEqual(plan(inputs, states, asOf));
    expect((second as Result).options).toEqual(expectedSuggestion);
  });
  test("R16 conflicting bound preferences are never overwritten", () => {
    const { aid, inputs, states, asOf } = fixture(); const before = structuredClone(aid);
    inputs.preferences[0]!.quiet = false;
    expect(instantiate(aid, inputs, states, asOf, "applies")).toEqual({ status: "reconsider", reason: "bindingConflict", binding: "preferences" });
    expect(aid).toEqual(before);
  });
  test("X-R01 unknown validity differs from invalid and ineligible", () => {
    const { aid, inputs, states, asOf } = fixture(); states["p-mira"]!.validity = "unknown";
    expect(instantiate(aid, complement(inputs), states, asOf, "applies")).toEqual({ status: "missing", slots: ["Mira.preference.validityEvidence"] });
  });
  test("X-R02 current closed places produce known infeasibility", () => {
    const { inputs, states, asOf } = fixture(); inputs.places[0]!.open = false;
    const result = plan(inputs, states, asOf) as Result;
    expect(result.status).toBe("result"); expect(result.options).toEqual([]); expect(result.reasons).toContain("noKnownMatchingPlace");
  });
  test("X-R03 nested availability validation is bounded", () => {
    const { inputs } = fixture();
    inputs.availability[0]!.windows = Array.from({ length: 101 }, () => [60, 120]);
    let touched = false;
    Object.defineProperty(inputs.availability[0]!.windows, 0, { get() { touched = true; throw new Error("oversize window list scanned"); } });
    expect(overlap(inputs.availability, { ...DEFAULT_LIMITS, work: 100 })).toMatchObject({ status: "unsupported" });
    expect(touched).toBe(false);
  });
  test("X-R04 source object field order does not create false binding conflict", () => {
    const { aid, inputs, states, asOf } = fixture();
    inputs.preferences = inputs.preferences.map(p => ({ ...p, source: { revision: p.source.revision, id: p.source.id } }));
    expect((instantiate(aid, inputs, states, asOf, "applies") as Result).options).toEqual(expectedSuggestion);
  });
  test("X-R05 supplied asOf excludes elapsed availability", () => {
    const { inputs, states } = fixture();
    expect((plan(inputs, states, 100) as Result).options).toEqual([{ place: "G", window: [100, 115], tentative: true }]);
    expect((plan(inputs, states, 110) as Result).options).toEqual([]);
  });
});
