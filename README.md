# @voidly/cli

Terminal access to [Voidly](https://voidly.ai)'s censorship intelligence APIs.
Check if a domain is blocked anywhere in the world, query 5,300+ documented
incidents, view 7-day shutdown forecasts, and more — directly from your shell.

Powered by 19.6M live OONI samples, 10 years of historical measurements, and
the Sentinel early-warning model.

## Install

```bash
# One-off (no install)
npx @voidly/cli check chat.openai.com IR

# Global install
npm install -g @voidly/cli
voidly --help
```

Requires Node.js 18+. No API key needed for read endpoints.

## Quick start

```bash
# Is ChatGPT blocked in China?
voidly check chat.openai.com CN

# Compare a domain across multiple countries
voidly check whatsapp.com --countries IR,RU,CN,TR

# Full country censorship summary
voidly summary IR

# Recent incidents
voidly incidents --country RU --limit 10

# One incident in detail
voidly incident IR-2026-0142

# Global censorship index
voidly index

# Topic-specific index (e.g. women's health, news, LGBTQ)
voidly index --topic women-health

# Sentinel risk heatmap
voidly heatmap --min-risk 0.3

# 7-day shutdown forecast
voidly forecast IR
```

## Output modes

| Flag | Behavior |
| --- | --- |
| _(none)_ | Pretty terminal tables with color |
| `--json` | Raw JSON straight from the API — pipe to `jq`, save to a file, etc. |
| `--quiet` | One value per line, suitable for shell loops |

```bash
# Save raw data
voidly incidents --country IR --json > iran-incidents.json

# Pipe IDs into another command
voidly incidents --quiet | xargs -I {} voidly incident {}

# JSON + jq
voidly forecast RU --json | jq '.forecast_summary.max_risk'
```

## Commands

| Command | Description |
| --- | --- |
| `voidly check <domain> [country]` | Check if a domain is accessible (default `IR`) |
| `voidly check <domain> --countries IR,RU,CN` | Batch check across countries |
| `voidly summary <country>` | Country-wide accessibility summary |
| `voidly incidents [--country CC] [--limit N]` | List recent incidents |
| `voidly incident <id>` | Show one incident (readable ID or hash) |
| `voidly index [--topic NAME]` | Global censorship index, optionally by topic |
| `voidly heatmap [--min-risk N]` | Sentinel global risk heatmap |
| `voidly forecast <country>` | 7-day shutdown-risk forecast with SHAP drivers |

## Environment

| Variable | Purpose |
| --- | --- |
| `VOIDLY_API_URL` | Override base URL (default `https://api.voidly.ai`) |
| `NO_COLOR` | Disable ANSI color output |

## Use it from AI agents

For Claude / Cursor / Windsurf via the Model Context Protocol:

```bash
npx @voidly/mcp-server
```

83 tools covering everything in this CLI plus agent-relay messaging, incident
evidence, ISP risk, election briefings, probe network status, and more.

## API documentation

Full reference: <https://voidly.ai/api-docs>

All endpoints exposed by this CLI are public and CC BY 4.0 licensed.

## License

MIT
