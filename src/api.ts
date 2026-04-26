/**
 * Thin wrapper around api.voidly.ai endpoints.
 * No auth required for read endpoints.
 */

const BASE_URL = process.env.VOIDLY_API_URL || "https://api.voidly.ai";
const USER_AGENT = `voidly-cli/0.1.0 (+https://github.com/voidly-ai/cli)`;

export class VoidlyApiError extends Error {
  constructor(
    message: string,
    public status?: number,
    public url?: string,
  ) {
    super(message);
    this.name = "VoidlyApiError";
  }
}

async function request<T = any>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const url = path.startsWith("http") ? path : `${BASE_URL}${path}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);

  try {
    const res = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "User-Agent": USER_AGENT,
        ...(init?.headers || {}),
      },
    });

    if (!res.ok) {
      let body = "";
      try {
        body = await res.text();
      } catch {}
      const snippet = body.slice(0, 200);
      throw new VoidlyApiError(
        `HTTP ${res.status} ${res.statusText}${snippet ? ` — ${snippet}` : ""}`,
        res.status,
        url,
      );
    }

    return (await res.json()) as T;
  } catch (err: any) {
    if (err instanceof VoidlyApiError) throw err;
    if (err.name === "AbortError") {
      throw new VoidlyApiError(`Request timeout after 30s`, undefined, url);
    }
    throw new VoidlyApiError(
      `Network error: ${err.message || err}`,
      undefined,
      url,
    );
  } finally {
    clearTimeout(timeout);
  }
}

// ---------- Accessibility ----------

export interface AccessibilityCheck {
  domain: string;
  country: string;
  countryName: string;
  status: "accessible" | "blocked" | "degraded" | "unknown" | string;
  accessibilityScore: number | null;
  blockingMethod: string | null;
  confidence: number;
  evidenceCount: number;
  methods: string[];
  checkedAt: string;
}

export function checkAccessibility(
  domain: string,
  country: string,
): Promise<AccessibilityCheck> {
  const q = new URLSearchParams({ domain, country });
  return request(`/v1/accessibility/check?${q}`);
}

export function batchAccessibility(
  domains: string[],
  country: string,
): Promise<{ results: AccessibilityCheck[] }> {
  return request("/v1/accessibility/batch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ domains, country }),
  });
}

export function countrySummary(country: string): Promise<any> {
  return request(`/v1/accessibility/country/${country}/summary`);
}

// ---------- Incidents ----------

export interface Incident {
  id: string;
  hashId: string;
  readableId: string;
  country: string;
  countryName: string;
  flag?: string;
  title: string;
  description: string;
  severity: string;
  incidentType: string;
  confidence: number;
  status: string;
  startTime: string;
  endTime?: string;
  sources: string[];
  reportUrl?: string;
  affectedDomains?: string[];
  affectedAsns?: string[];
}

export function listIncidents(opts: {
  country?: string;
  limit?: number;
}): Promise<{ incidents: Incident[]; total: number; count: number }> {
  const q = new URLSearchParams();
  if (opts.country) q.set("country", opts.country);
  if (opts.limit) q.set("limit", String(opts.limit));
  return request(`/data/incidents?${q}`);
}

export function getIncident(id: string): Promise<Incident> {
  return request(`/data/incidents/${encodeURIComponent(id)}`);
}

// ---------- Censorship Index ----------

export function getCensorshipIndex(topic?: string): Promise<any> {
  if (topic) {
    return request(`/v1/topic-censorship-index?topic=${encodeURIComponent(topic)}`);
  }
  return request("/data/censorship-index.json");
}

// ---------- Sentinel ----------

export interface SentinelRisk {
  country: string;
  country_name: string;
  forecast_window: Array<{
    date: string;
    day: number;
    risk: number;
    drivers: string[];
  }>;
  forecast_summary: {
    avg_risk: number;
    max_risk: number;
    max_risk_day: number;
    key_drivers: string[];
  };
  trust?: {
    interval_90?: [number, number];
    top_features?: Array<{ name: string; contribution: number; direction: string }>;
    similar_incident?: { readable_id?: string; url?: string };
  };
}

export function getCurrentRisk(country: string): Promise<SentinelRisk> {
  return request(`/v1/sentinel/current_risk/${country}`);
}

export function getGlobalHeatmap(opts?: {
  min_risk?: number;
}): Promise<any> {
  const q = new URLSearchParams();
  if (opts?.min_risk !== undefined) q.set("min_risk", String(opts.min_risk));
  return request(`/v1/sentinel/global_heatmap${q.toString() ? `?${q}` : ""}`);
}

// ---------- Forecast (legacy alias) ----------

export function getForecast(country: string): Promise<any> {
  // Use Sentinel as primary forecast source — richer payload than /v1/forecast/CC/7day.
  return getCurrentRisk(country);
}
