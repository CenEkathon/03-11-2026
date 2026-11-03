import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, ApiError, API_BASE } from "./client";

/** Builds a minimal Response-like object for the mocked fetch. */
function response(status: number, text: string) {
  return { ok: status >= 200 && status < 300, status, text: async () => text };
}

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("api client", () => {
  it("calls the default backend base URL for GET requests", async () => {
    fetchMock.mockResolvedValue(response(200, '{"company":{"id":"mock"}}'));
    const data = await api.caseInfo();
    expect(API_BASE).toBe("http://127.0.0.1:8000");
    expect(fetchMock).toHaveBeenCalledWith("http://127.0.0.1:8000/api/case", {
      method: "GET",
      headers: undefined,
      body: undefined,
    });
    expect(data).toEqual({ company: { id: "mock" } });
  });

  it.each([
    ["skills", () => api.skills(), "/api/skills"],
    ["assumptions", () => api.assumptions(), "/api/assumptions"],
    ["usage", () => api.usage(), "/api/usage"],
  ])("requests %s with GET", async (_name, call, path) => {
    fetchMock.mockResolvedValue(response(200, "{}"));
    await call();
    expect(fetchMock.mock.calls[0][0]).toBe(`http://127.0.0.1:8000${path}`);
    expect(fetchMock.mock.calls[0][1].method).toBe("GET");
  });

  it("sends the plan request as JSON on POST", async () => {
    fetchMock.mockResolvedValue(response(200, '{"case":"base"}'));
    const req = { case: "base" as const, milestone_dates: null, assumption_overrides: { hire_cost: 3000 } };
    await api.computePlan(req);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://127.0.0.1:8000/api/plan/compute");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ "Content-Type": "application/json" });
    expect(JSON.parse(init.body)).toEqual(req);
  });

  it("posts sensitivity and brief requests to their own paths", async () => {
    fetchMock.mockResolvedValue(response(200, "[]"));
    await api.sensitivity({ case: "low" });
    await api.brief({ scenario: "hybrid", case: "high", lang: "en" });
    expect(fetchMock.mock.calls[0][0]).toBe("http://127.0.0.1:8000/api/plan/sensitivity");
    expect(fetchMock.mock.calls[1][0]).toBe("http://127.0.0.1:8000/api/brief");
  });

  it("returns null for an empty successful body", async () => {
    fetchMock.mockResolvedValue(response(200, ""));
    await expect(api.usage()).resolves.toBeNull();
  });

  it("throws an ApiError carrying the status and the parsed error body", async () => {
    fetchMock.mockResolvedValue(response(500, '{"detail":"boom"}'));
    const error = await api.skills().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(500);
    expect((error as ApiError).body).toEqual({ detail: "boom" });
    expect((error as ApiError).message).toBe("API error 500");
  });

  it("keeps a null body for an error response with no content", async () => {
    fetchMock.mockResolvedValue(response(503, ""));
    const error = (await api.usage().catch((e: unknown) => e)) as ApiError;
    expect(error.body).toBeNull();
  });

  it("reads the base URL from VITE_API_URL when it is set", async () => {
    vi.stubEnv("VITE_API_URL", "https://example.test");
    vi.resetModules();
    const fresh = await import("./client");
    fetchMock.mockResolvedValue(response(200, "{}"));
    await fresh.api.usage();
    expect(fetchMock.mock.calls[0][0]).toBe("https://example.test/api/usage");
    expect(fresh.API_BASE).toBe("https://example.test");
  });
});

describe("ApiError.validationErrors", () => {
  it("uses the validation errors from a roadmap rejection", () => {
    const error = new ApiError(422, { validation: { errors: ["M2 starts too early"] } });
    expect(error.validationErrors()).toEqual(["M2 starts too early"]);
  });

  it("uses a string detail as the single message", () => {
    expect(new ApiError(400, { detail: "bad input" }).validationErrors()).toEqual(["bad input"]);
  });

  it("maps FastAPI validation items to their messages, with a fallback for items without one", () => {
    const error = new ApiError(422, { detail: [{ msg: "field required" }, { loc: ["body"] }] });
    expect(error.validationErrors()).toEqual(["field required", "invalid input"]);
  });

  it("falls back to the status when the body has nothing readable", () => {
    expect(new ApiError(502, null).validationErrors()).toEqual(["Request failed with status 502"]);
    expect(new ApiError(502, { detail: 42 }).validationErrors()).toEqual(["Request failed with status 502"]);
  });
});
