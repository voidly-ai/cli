/**
 * Plain-ASCII terminal formatters. No deps.
 */

const supportsColor =
  process.stdout.isTTY && !process.env.NO_COLOR && process.env.TERM !== "dumb";

export function color(code: string, s: string): string {
  if (!supportsColor) return s;
  return `\x1b[${code}m${s}\x1b[0m`;
}

export const c = {
  red: (s: string) => color("31", s),
  green: (s: string) => color("32", s),
  yellow: (s: string) => color("33", s),
  blue: (s: string) => color("34", s),
  magenta: (s: string) => color("35", s),
  cyan: (s: string) => color("36", s),
  bold: (s: string) => color("1", s),
  dim: (s: string) => color("2", s),
};

export function statusColor(status: string): string {
  const s = (status || "").toLowerCase();
  if (s === "accessible" || s === "low") return c.green(status);
  if (s === "blocked" || s === "high" || s === "critical") return c.red(status);
  if (s === "degraded" || s === "medium" || s === "interference") return c.yellow(status);
  return c.dim(status || "unknown");
}

export function severityColor(sev: string): string {
  return statusColor(sev);
}

/** Pad-right within a fixed visible width (ignores ANSI codes). */
function padRight(s: string, width: number): string {
  const visible = s.replace(/\x1b\[[0-9;]*m/g, "");
  const pad = Math.max(0, width - visible.length);
  return s + " ".repeat(pad);
}

export interface Column {
  key: string;
  header: string;
  width?: number;
  format?: (v: any, row: any) => string;
}

export function table(rows: any[], cols: Column[]): string {
  if (!rows || rows.length === 0) return c.dim("(no rows)");

  // compute widths
  const widths = cols.map((col) => {
    if (col.width) return col.width;
    let w = col.header.length;
    for (const r of rows) {
      const v = col.format ? col.format(r[col.key], r) : String(r[col.key] ?? "");
      const visible = v.replace(/\x1b\[[0-9;]*m/g, "");
      if (visible.length > w) w = visible.length;
    }
    return Math.min(w, 60);
  });

  const sep = "  ";
  const headerLine = cols
    .map((col, i) => c.bold(padRight(col.header, widths[i])))
    .join(sep);
  const divider = cols.map((_, i) => "-".repeat(widths[i])).join(sep);

  const lines = [headerLine, c.dim(divider)];
  for (const r of rows) {
    const cells = cols.map((col, i) => {
      const raw = col.format ? col.format(r[col.key], r) : String(r[col.key] ?? "");
      let s = raw;
      const visible = s.replace(/\x1b\[[0-9;]*m/g, "");
      if (visible.length > widths[i]) {
        // truncate visible
        let cnt = 0;
        let out = "";
        let inAnsi = false;
        for (const ch of s) {
          if (ch === "\x1b") inAnsi = true;
          if (!inAnsi) {
            if (cnt >= widths[i] - 1) {
              out += "…";
              break;
            }
            cnt++;
          }
          out += ch;
          if (inAnsi && ch === "m") inAnsi = false;
        }
        s = out;
      }
      return padRight(s, widths[i]);
    });
    lines.push(cells.join(sep));
  }
  return lines.join("\n");
}

export function kv(items: Array<[string, string]>): string {
  const keyWidth = Math.max(...items.map(([k]) => k.length));
  return items
    .map(([k, v]) => `${c.dim(padRight(k + ":", keyWidth + 2))} ${v}`)
    .join("\n");
}

export function pct(n: number | null | undefined, digits = 1): string {
  if (n == null || isNaN(n as number)) return c.dim("—");
  return `${(n * 100).toFixed(digits)}%`;
}

export function num(n: any): string {
  if (n == null) return c.dim("—");
  return String(n);
}

export function emoji(name: string): string {
  if (!supportsColor) return "";
  const map: Record<string, string> = {
    check: "✓",
    cross: "✗",
    warn: "!",
    arrow: "→",
    dot: "•",
  };
  return map[name] || "";
}

/** Format a date string as YYYY-MM-DD HH:mm UTC. */
export function fmtDate(iso?: string | null): string {
  if (!iso) return c.dim("—");
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    const y = d.getUTCFullYear();
    const mo = String(d.getUTCMonth() + 1).padStart(2, "0");
    const da = String(d.getUTCDate()).padStart(2, "0");
    const h = String(d.getUTCHours()).padStart(2, "0");
    const mi = String(d.getUTCMinutes()).padStart(2, "0");
    return `${y}-${mo}-${da} ${h}:${mi} UTC`;
  } catch {
    return iso;
  }
}
