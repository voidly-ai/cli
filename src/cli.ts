#!/usr/bin/env node
/**
 * @voidly/cli — terminal access to Voidly's censorship intelligence APIs.
 */
import { Command } from "commander";
import {
  checkAccessibility,
  batchAccessibility,
  countrySummary,
  listIncidents,
  getIncident,
  getCensorshipIndex,
  getCurrentRisk,
  getGlobalHeatmap,
  VoidlyApiError,
} from "./api.js";
import { c, table, kv, pct, fmtDate, statusColor, severityColor } from "./format.js";

const VERSION = "0.2.0";

interface GlobalOpts {
  json?: boolean;
  quiet?: boolean;
}

function jsonOut(obj: unknown): void {
  process.stdout.write(JSON.stringify(obj, null, 2) + "\n");
}

function fail(msg: string, code = 1): never {
  process.stderr.write(c.red("error: ") + msg + "\n");
  process.exit(code);
}

async function run<T>(promise: Promise<T>): Promise<T> {
  try {
    return await promise;
  } catch (err: any) {
    if (err instanceof VoidlyApiError) {
      if (err.status === 404) {
        fail(`Not found (${err.url}). Check your inputs.`);
      }
      if (err.status === 429) {
        fail(`Rate limited. Try again in a moment.`);
      }
      fail(err.message);
    }
    fail(`Unexpected error: ${err?.message || err}`);
  }
}

const program = new Command();

program
  .name("voidly")
  .description(
    "Voidly CLI — query global internet-censorship intelligence from your terminal.\n" +
      "Powered by 19.6M live OONI samples, 5,300+ documented incidents, and Sentinel forecasts.\n" +
      "Docs: https://voidly.ai/api-docs",
  )
  .version(VERSION, "-v, --version", "print version")
  .option("--json", "output raw JSON")
  .option("--quiet", "minimal output for piping");

// ---------- check ----------
program
  .command("check <domain> [country]")
  .description("Check if a domain is accessible in a country (default: IR)")
  .option("--countries <list>", "comma-separated country codes for batch check")
  .action(async (domain: string, country: string | undefined, opts: any) => {
    const g = program.opts<GlobalOpts>();
    const countries: string[] = opts.countries
      ? opts.countries.split(",").map((s: string) => s.trim().toUpperCase()).filter(Boolean)
      : [];

    if (countries.length > 0) {
      // Batch path: check the same domain across multiple countries.
      const results = await Promise.all(
        countries.map((cc) => run(checkAccessibility(domain, cc))),
      );
      if (g.json) return jsonOut(results);
      if (g.quiet) {
        for (const r of results) process.stdout.write(`${r.country}\t${r.status}\n`);
        return;
      }
      console.log(c.bold(`Accessibility of ${domain}`));
      console.log(
        table(results, [
          { key: "country", header: "CC", width: 4 },
          { key: "countryName", header: "Country", width: 22 },
          {
            key: "status",
            header: "Status",
            format: (v) => statusColor(String(v || "unknown")),
          },
          {
            key: "blockingMethod",
            header: "Method",
            format: (v) => (v ? String(v) : c.dim("—")),
          },
          {
            key: "confidence",
            header: "Conf",
            format: (v) => (typeof v === "number" ? pct(v, 0) : c.dim("—")),
          },
          {
            key: "evidenceCount",
            header: "Evidence",
            format: (v) => String(v ?? 0),
          },
        ]),
      );
      return;
    }

    const cc = (country || "IR").toUpperCase();
    const r = await run(checkAccessibility(domain, cc));
    if (g.json) return jsonOut(r);
    if (g.quiet) {
      process.stdout.write(`${r.status}\n`);
      return;
    }
    console.log(c.bold(`${r.domain} in ${r.countryName} (${r.country})`));
    console.log(
      kv([
        ["Status", statusColor(r.status || "unknown")],
        ["Blocking method", r.blockingMethod || c.dim("—")],
        ["Confidence", typeof r.confidence === "number" ? pct(r.confidence, 0) : c.dim("—")],
        ["Evidence count", String(r.evidenceCount ?? 0)],
        [
          "Methods",
          r.methods && r.methods.length > 0 ? r.methods.join(", ") : c.dim("—"),
        ],
        ["Checked at", fmtDate(r.checkedAt)],
      ]),
    );
    if (r.evidenceCount === 0) {
      console.log(
        "\n" +
          c.dim(
            `No probe evidence yet for this pair — try a high-watch country (IR, CN, RU) or a popular domain.`,
          ),
      );
    }
  });

// ---------- summary ----------
program
  .command("summary <country>")
  .description("Country-wide accessibility summary")
  .action(async (country: string) => {
    const g = program.opts<GlobalOpts>();
    const r: any = await run(countrySummary(country.toUpperCase()));
    if (g.json) return jsonOut(r);

    console.log(c.bold(`Censorship summary — ${r.countryName || country.toUpperCase()}`));
    const items: Array<[string, string]> = [];
    if (r.country) items.push(["Country code", r.country]);
    if (r.totalDomainsChecked != null) items.push(["Domains checked", String(r.totalDomainsChecked)]);
    if (r.blockedCount != null) items.push(["Blocked", c.red(String(r.blockedCount))]);
    if (r.degradedCount != null) items.push(["Degraded", c.yellow(String(r.degradedCount))]);
    if (r.accessibleCount != null) items.push(["Accessible", c.green(String(r.accessibleCount))]);
    if (r.blockRate != null) items.push(["Block rate", pct(r.blockRate)]);
    if (r.lastUpdated) items.push(["Last updated", fmtDate(r.lastUpdated)]);
    if (items.length > 0) console.log(kv(items));

    const blocked: any[] = r.topBlocked || r.blocked || r.blockedDomains || [];
    if (Array.isArray(blocked) && blocked.length > 0) {
      console.log("\n" + c.bold("Top blocked domains:"));
      const rows = blocked.slice(0, 20).map((b: any) =>
        typeof b === "string" ? { domain: b, blockRate: null } : b,
      );
      console.log(
        table(rows, [
          { key: "domain", header: "Domain", width: 40 },
          {
            key: "blockRate",
            header: "Block rate",
            format: (v) => (typeof v === "number" ? pct(v) : c.dim("—")),
          },
          {
            key: "method",
            header: "Method",
            format: (v) => (v ? String(v) : c.dim("—")),
          },
        ]),
      );
    }
  });

// ---------- incidents ----------
program
  .command("incidents")
  .description("List recent censorship incidents")
  .option("-c, --country <cc>", "filter by country code (e.g. IR, CN, RU)")
  .option("-l, --limit <n>", "max results", "20")
  .action(async (opts: any) => {
    const g = program.opts<GlobalOpts>();
    const limit = Math.max(1, Math.min(parseInt(opts.limit, 10) || 20, 200));
    const r = await run(
      listIncidents({
        country: opts.country ? String(opts.country).toUpperCase() : undefined,
        limit,
      }),
    );
    if (g.json) return jsonOut(r);
    if (g.quiet) {
      for (const i of r.incidents) process.stdout.write(`${i.readableId}\n`);
      return;
    }
    console.log(
      c.bold(
        `Incidents${opts.country ? ` in ${opts.country.toUpperCase()}` : ""} ` +
          c.dim(`(showing ${r.incidents.length} of ${r.total})`),
      ),
    );
    console.log(
      table(r.incidents, [
        { key: "readableId", header: "ID", width: 14 },
        { key: "country", header: "CC", width: 4 },
        {
          key: "severity",
          header: "Severity",
          format: (v) => severityColor(String(v || "")),
        },
        { key: "incidentType", header: "Type", width: 14 },
        { key: "title", header: "Title", width: 50 },
        {
          key: "startTime",
          header: "Start",
          format: (v) => fmtDate(String(v)),
        },
      ]),
    );
    console.log(
      "\n" +
        c.dim(
          "Get details: voidly incident <ID>   |   JSON: voidly incidents --json",
        ),
    );
  });

// ---------- incident ----------
program
  .command("incident <id>")
  .description("Show one incident by readable ID (e.g. IR-2026-0142) or hash ID")
  .action(async (id: string) => {
    const g = program.opts<GlobalOpts>();
    const r = await run(getIncident(id));
    if (g.json) return jsonOut(r);
    console.log(c.bold(`${r.readableId || r.id} — ${r.title}`));
    console.log(
      kv([
        ["Country", `${r.countryName} (${r.country})`],
        ["Severity", severityColor(r.severity)],
        ["Type", r.incidentType],
        ["Status", statusColor(r.status)],
        ["Confidence", pct(r.confidence)],
        ["Started", fmtDate(r.startTime)],
        ["Ended", r.endTime ? fmtDate(r.endTime) : c.dim("ongoing")],
        ["Sources", (r.sources || []).join(", ") || c.dim("—")],
        [
          "Affected domains",
          r.affectedDomains && r.affectedDomains.length > 0
            ? r.affectedDomains.slice(0, 10).join(", ")
            : c.dim("—"),
        ],
        [
          "Affected ASNs",
          r.affectedAsns && r.affectedAsns.length > 0
            ? r.affectedAsns.slice(0, 10).join(", ")
            : c.dim("—"),
        ],
        [
          "Report",
          r.reportUrl ||
            `https://voidly.ai/censorship-index/incidents/${r.readableId || r.id}`,
        ],
      ]),
    );
    if (r.description) {
      console.log("\n" + c.bold("Description:"));
      console.log(r.description);
    }
  });

// ---------- index ----------
program
  .command("index")
  .description("Global censorship index — country rankings")
  .option(
    "-t, --topic <name>",
    "topic-specific index (e.g. women-health, news, lgbtq)",
  )
  .option("-l, --limit <n>", "max rows shown", "20")
  .action(async (opts: any) => {
    const g = program.opts<GlobalOpts>();
    const r = await run(getCensorshipIndex(opts.topic));
    if (g.json) return jsonOut(r);
    const limit = Math.max(1, Math.min(parseInt(opts.limit, 10) || 20, 250));
    const arr: any[] = Array.isArray(r)
      ? r
      : r.countries || r.data || r.index || r.results || [];
    if (!Array.isArray(arr) || arr.length === 0) {
      console.log(c.dim("No data returned."));
      return;
    }
    const sorted = arr
      .slice()
      .sort(
        (a, b) =>
          (b.score ?? b.blockRate ?? b.block_rate ?? 0) -
          (a.score ?? a.blockRate ?? a.block_rate ?? 0),
      )
      .slice(0, limit);
    console.log(
      c.bold(
        opts.topic
          ? `Topic censorship index — ${opts.topic}`
          : `Global censorship index`,
      ) + c.dim(` (top ${sorted.length})`),
    );
    console.log(
      table(sorted, [
        {
          key: "rank",
          header: "#",
          width: 4,
          format: (_, row) => String(row.rank ?? sorted.indexOf(row) + 1),
        },
        {
          key: "code",
          header: "CC",
          width: 4,
          format: (_, row) => String(row.code || row.country_code || row.countryCode || ""),
        },
        {
          key: "country",
          header: "Country",
          width: 26,
          format: (_, row) => String(row.country || row.countryName || row.name || ""),
        },
        {
          key: "blockRate",
          header: "Block rate",
          format: (_, row) => {
            const v = row.blockRate ?? row.block_rate;
            return typeof v === "number" ? pct(v) : c.dim("—");
          },
        },
        {
          key: "level",
          header: "Level",
          format: (_, row) => {
            const v = row.level || row.severity || "";
            return v ? severityColor(String(v)) : c.dim("—");
          },
        },
        {
          key: "samples",
          header: "Samples",
          format: (_, row) => {
            const v = row.samples ?? row.sample_count;
            return v != null ? String(v) : c.dim("—");
          },
        },
      ]),
    );
  });

// ---------- heatmap ----------
program
  .command("heatmap")
  .description("Global Sentinel risk heatmap (forecasts across all watched countries)")
  .option("--min-risk <n>", "minimum risk threshold (0..1)", "0")
  .action(async (opts: any) => {
    const g = program.opts<GlobalOpts>();
    const r: any = await run(getGlobalHeatmap({ min_risk: parseFloat(opts.minRisk) || 0 }));
    if (g.json) return jsonOut(r);
    const rows: any[] = r.countries || r.heatmap || r.results || [];
    if (!Array.isArray(rows) || rows.length === 0) {
      console.log(c.dim("No countries above threshold."));
      return;
    }
    console.log(c.bold(`Sentinel heatmap`) + c.dim(` (${rows.length} countries)`));
    console.log(
      table(rows, [
        {
          key: "country_code",
          header: "CC",
          width: 4,
          format: (_, row) =>
            String(row.country_code || row.country || row.code || ""),
        },
        {
          key: "country_name",
          header: "Country",
          width: 26,
          format: (_, row) =>
            String(row.country_name || row.countryName || row.name || ""),
        },
        {
          key: "risk",
          header: "Risk",
          format: (_, row) => {
            const v = row.risk ?? row.probability ?? row.max_risk ?? row.score;
            return typeof v === "number" ? pct(v) : c.dim("—");
          },
        },
        {
          key: "drivers",
          header: "Drivers",
          width: 50,
          format: (_, row) => {
            const d = row.drivers || row.key_drivers || [];
            return Array.isArray(d) && d.length > 0
              ? d.slice(0, 2).join("; ")
              : c.dim("—");
          },
        },
      ]),
    );
  });

// ---------- forecast ----------
program
  .command("forecast <country>")
  .description("7-day shutdown-risk forecast (Sentinel)")
  .action(async (country: string) => {
    const g = program.opts<GlobalOpts>();
    const r = await run(getCurrentRisk(country.toUpperCase()));
    if (g.json) return jsonOut(r);
    console.log(
      c.bold(`Sentinel forecast — ${r.country_name} (${r.country})`),
    );
    const summary = r.forecast_summary;
    if (summary) {
      console.log(
        kv([
          ["Avg risk (7d)", pct(summary.avg_risk)],
          [
            "Max risk",
            `${pct(summary.max_risk)} on day +${summary.max_risk_day}`,
          ],
          [
            "Key drivers",
            summary.key_drivers && summary.key_drivers.length > 0
              ? summary.key_drivers.slice(0, 3).join("; ")
              : c.dim("—"),
          ],
        ]),
      );
    }
    if (r.trust?.interval_90) {
      const [lo, hi] = r.trust.interval_90;
      console.log(c.dim(`90% conformal interval: ${pct(lo)} – ${pct(hi)}`));
    }
    console.log("\n" + c.bold("Daily forecast:"));
    console.log(
      table(r.forecast_window || [], [
        { key: "day", header: "Day", width: 5, format: (v) => `+${v}` },
        { key: "date", header: "Date" },
        {
          key: "risk",
          header: "Risk",
          format: (v) => (typeof v === "number" ? pct(v) : c.dim("—")),
        },
        {
          key: "drivers",
          header: "Drivers",
          format: (v) =>
            Array.isArray(v) && v.length > 0 ? v.join("; ") : c.dim("—"),
        },
      ]),
    );
    if (r.trust?.top_features && r.trust.top_features.length > 0) {
      console.log("\n" + c.bold("Top features (SHAP):"));
      for (const f of r.trust.top_features.slice(0, 3)) {
        const arrow = f.direction === "up" ? c.red("↑") : c.green("↓");
        console.log(
          `  ${arrow} ${f.name} ${c.dim(`(${f.contribution.toFixed(4)})`)}`,
        );
      }
    }
    if (r.trust?.similar_incident?.url) {
      console.log(
        "\n" + c.dim(`Similar incident: ${r.trust.similar_incident.url}`),
      );
    }
  });

// ---------- v0.2.0: status ----------
program
  .command("status")
  .description("Quick health check of all Voidly services")
  .action(async () => {
    const opts = program.opts<GlobalOpts>();
    const services = [
      { name: "Worker API", url: "https://api.voidly.ai/health" },
      { name: "Intelligence ML", url: "https://intelligence.voidly.ai:8443/health" },
      { name: "Voidly Pay", url: "https://api.voidly.ai/v1/pay/health" },
      { name: "Sentinel", url: "https://api.voidly.ai/v1/sentinel/health" },
      { name: "Probes", url: "https://api.voidly.ai/v1/probe/stats" },
      { name: "Incidents", url: "https://api.voidly.ai/data/incidents/stats" },
    ];
    const results = await Promise.all(
      services.map(async (s) => {
        const t0 = Date.now();
        try {
          const ctrl = new AbortController();
          const timer = setTimeout(() => ctrl.abort(), 5000);
          const r = await fetch(s.url, { signal: ctrl.signal });
          clearTimeout(timer);
          return { ...s, status: r.ok ? "healthy" : "degraded", code: r.status, latency: Date.now() - t0 };
        } catch {
          return { ...s, status: "down", code: 0, latency: Date.now() - t0 };
        }
      }),
    );
    if (opts.json) return jsonOut({ services: results });
    console.log(c.bold("Voidly Service Status"));
    console.log(
      table(results, [
        { key: "name", header: "Service" },
        { key: "status", header: "Status", format: (v: string) => statusColor(v) },
        { key: "code", header: "HTTP", format: (v: number) => String(v || "—") },
        { key: "latency", header: "Latency", format: (v: number) => v + "ms" },
      ]),
    );
    const downCount = results.filter((r) => r.status !== "healthy").length;
    if (downCount > 0) {
      console.log("\n" + c.yellow(`${downCount} service(s) not healthy.`));
      process.exit(1);
    } else {
      console.log("\n" + c.green("All systems operational."));
    }
  });

// ---------- v0.2.0: cite ----------
program
  .command("cite <id>")
  .description("Generate citation for an incident (BibTeX/RIS/Markdown/Chicago/APA)")
  .option("-f, --format <type>", "format: bibtex|ris|markdown|chicago|apa", "bibtex")
  .action(async (id: string, options: { format: string }) => {
    const opts = program.opts<GlobalOpts>();
    const inc = await run(getIncident(id));
    const fmt = options.format.toLowerCase();
    const year = (inc.startTime || new Date().toISOString()).slice(0, 4);
    const date = (inc.startTime || new Date().toISOString()).slice(0, 10);
    const title = inc.title || `Censorship incident in ${inc.countryName || inc.country}`;
    const url = `https://voidly.ai/censorship-index/incidents/${id}`;
    const cleanId = id.replace(/[^A-Za-z0-9-]/g, "");

    if (opts.json) return jsonOut({ id, format: fmt, citation: "" });

    if (fmt === "bibtex") {
      console.log(
        `@misc{voidly_${cleanId},\n` +
          `  author       = {{Voidly Research}},\n` +
          `  title        = {{${title}}},\n` +
          `  year         = {${year}},\n` +
          `  howpublished = {Voidly Censorship Intelligence},\n` +
          `  url          = {${url}},\n` +
          `  note         = {Incident ID: ${id}, accessed ${new Date().toISOString().slice(0, 10)}}\n` +
          `}`,
      );
    } else if (fmt === "ris") {
      console.log(
        `TY  - ELEC\nTI  - ${title}\nAU  - Voidly Research\nPY  - ${year}\nDA  - ${date}\nUR  - ${url}\nID  - ${id}\nER  -`,
      );
    } else if (fmt === "chicago") {
      console.log(`Voidly Research. "${title}." ${date}. ${url}.`);
    } else if (fmt === "apa") {
      console.log(`Voidly Research. (${year}). ${title}. Voidly. ${url}`);
    } else {
      // markdown
      console.log(`[${title}](${url}) — Voidly Research, ${date}. Incident ID: \`${id}\`.`);
    }
  });

// ---------- v0.2.0: watch ----------
program
  .command("watch <domain>")
  .description("Long-running watcher: poll accessibility every interval seconds")
  .option("-c, --countries <list>", "comma-separated country codes", "IR,RU,CN")
  .option("-i, --interval <n>", "poll interval in seconds", "60")
  .action(async (domain: string, options: { countries: string; interval: string }) => {
    const opts = program.opts<GlobalOpts>();
    const countries = options.countries.split(",").map((s) => s.trim().toUpperCase());
    const intervalMs = Math.max(10, parseInt(options.interval, 10)) * 1000;
    const lastStatus = new Map<string, string>();
    if (!opts.quiet) {
      console.log(c.bold(`Watching ${domain} in ${countries.join(", ")} (every ${options.interval}s)\n`));
      console.log(c.dim("Ctrl+C to stop"));
    }
    let firstRun = true;
    const tick = async () => {
      try {
        // batchAccessibility takes (domains, country) — fan out per country
        const perCountry = await Promise.all(
          countries.map((cc) => batchAccessibility([domain], cc).catch(() => null)),
        );
        if (!opts.quiet) {
          const ts = new Date().toLocaleTimeString();
          process.stdout.write(`\r[${ts}] `);
          for (let i = 0; i < countries.length; i++) {
            const cc = countries[i];
            const r = perCountry[i]?.results?.[0];
            const s = r?.status || "unknown";
            const prev = lastStatus.get(cc);
            if (!firstRun && prev && prev !== s) {
              process.stdout.write("\n" + c.yellow(`! CHANGE in ${cc}: ${prev} → ${s}`) + "\n");
            }
            lastStatus.set(cc, s);
            process.stdout.write(`${cc}=${statusColor(s)} `);
          }
        }
        firstRun = false;
      } catch (err: any) {
        process.stdout.write("\n" + c.red(`! err: ${err.message}`));
      }
    };
    await tick();
    setInterval(tick, intervalMs);
  });

// ---------- v0.2.0: bench ----------
program
  .command("bench")
  .description("Quick benchmark: most-restricted countries with severity bars")
  .option("-l, --limit <n>", "rows to show", "10")
  .option("--topic <name>", "filter by topic")
  .action(async (options: { limit: string; topic?: string }) => {
    const opts = program.opts<GlobalOpts>();
    const data = await run(getCensorshipIndex(options.topic));
    const limit = parseInt(options.limit, 10);
    const rows = (data.countries || []).slice(0, limit);
    if (opts.json) return jsonOut({ countries: rows });
    console.log(c.bold(`Most restricted countries${options.topic ? ` (${options.topic})` : ""}\n`));
    const maxScore = rows[0]?.score || 1;
    for (const r of rows) {
      const barLen = Math.round(((r.score || 0) / maxScore) * 30);
      const filled = "█".repeat(barLen);
      // severityColor returns the colored string; build bar manually
      const colored = (r.level || "").toLowerCase();
      let bar = filled;
      if (colored === "severe" || colored === "high" || colored === "critical") bar = c.red(filled);
      else if (colored === "medium" || colored === "interference") bar = c.yellow(filled);
      else if (colored === "low") bar = c.green(filled);
      else bar = c.dim(filled);
      bar += c.dim("░".repeat(30 - barLen));
      console.log(
        `  ${(r.code || "??").padEnd(4)} ${(r.country || "").padEnd(20)} ${bar} ${String(r.score || 0).padStart(3)}  ${c.dim(r.level || "")}`,
      );
    }
  });

// ---------- footer ----------
program.addHelpText(
  "after",
  `
${c.bold("Examples:")}
  $ voidly check chat.openai.com IR
  $ voidly check whatsapp.com --countries IR,RU,CN
  $ voidly status                              # health check all services
  $ voidly cite IR-2026-0142 --format bibtex   # generate citation
  $ voidly watch claude.ai --countries CN,IR   # long-running watcher
  $ voidly bench --limit 5                      # most-restricted countries
  $ voidly summary CN
  $ voidly incidents --country IR --limit 10
  $ voidly incident IR-2026-0142
  $ voidly index --topic women-health
  $ voidly heatmap --min-risk 0.3
  $ voidly forecast RU
  $ voidly check google.com US --json | jq

${c.bold("Docs:")} https://voidly.ai/api-docs
${c.bold("MCP:")}  npx @voidly/mcp-server  (119 tools for Claude/Cursor/Windsurf)
`,
);

// Pretty print on no command
if (process.argv.length <= 2) {
  program.outputHelp();
  process.exit(0);
}

program.parseAsync(process.argv).catch((err) => {
  fail(err?.message || String(err));
});
