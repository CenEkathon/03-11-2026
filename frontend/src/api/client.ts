import type {
  AssumptionsResponse,
  BriefRequest,
  BriefResponse,
  CaseInfo,
  PlanRequest,
  PlanResponse,
  SensitivityRow,
  SkillsResponse,
  UsageSummary,
} from "./types";

/** Base URL of the FastAPI backend. Override with VITE_API_URL. CORS allows localhost:5173. */
export const API_BASE: string =
  (import.meta.env.VITE_API_URL as string | undefined) ?? "http://127.0.0.1:8000";

export class ApiError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(status: number, body: unknown) {
    super(`API error ${status}`);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }

  /** Roadmap validation messages from a 422 response, if present. */
  validationErrors(): string[] {
    const body = this.body as { validation?: { errors?: string[] }; detail?: unknown } | null;
    if (body?.validation?.errors) return body.validation.errors;
    if (typeof body?.detail === "string") return [body.detail];
    if (Array.isArray(body?.detail)) {
      return body.detail.map((d) => {
        const item = d as { msg?: string };
        return item.msg ?? "invalid input";
      });
    }
    return [`Request failed with status ${this.status}`];
  }
}

async function request<T>(method: "GET" | "POST" | "PUT", path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  const data: unknown = text ? JSON.parse(text) : null;
  if (!res.ok) throw new ApiError(res.status, data);
  return data as T;
}

export const api = {
  caseInfo: () => request<CaseInfo>("GET", "/api/case"),
  skills: () => request<SkillsResponse>("GET", "/api/skills"),
  assumptions: () => request<AssumptionsResponse>("GET", "/api/assumptions"),
  computePlan: (req: PlanRequest) => request<PlanResponse>("POST", "/api/plan/compute", req),
  sensitivity: (req: PlanRequest) => request<SensitivityRow[]>("POST", "/api/plan/sensitivity", req),
  brief: (req: BriefRequest) => request<BriefResponse>("POST", "/api/brief", req),
  usage: () => request<UsageSummary>("GET", "/api/usage"),
};
