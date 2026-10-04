# @voidly/cli

Query [Voidly censorship research](https://voidly.ai/data) from a terminal. The CLI wraps public read endpoints for domain accessibility, country summaries, incidents, the censorship index, and shutdown-risk estimates.

## Install and use

Requires Node.js 18 or later.

```bash
npx @voidly/cli check example.org IR

# Or install the command:
npm install -g @voidly/cli
voidly --help
```

Examples:

```bash
voidly check example.org --countries IR,RU,CN
voidly summary IR
voidly incidents --country IR --limit 10
voidly index
voidly heatmap --min-risk 0.3
voidly forecast IR
```

`check` returns the API's evidence-based status. `unknown` is neither confirmation of blocking nor confirmation of accessibility. Forecasts are model estimates, not observed future shutdowns. Inspect the [API documentation](https://voidly.ai/api-docs), [data provenance](https://voidly.ai/data), and [methodology](https://voidly.ai/methodology) before citing a result.

The package also includes `watch`, `cite`, `bench`, and `status` commands; use `voidly --help` for their current flags. `--json` exposes API payloads where supported. The CLI makes network requests to Voidly; it does not perform in-country measurement from your machine.

Source: [`src/`](src/) · Package: [npm](https://www.npmjs.com/package/@voidly/cli) · License: [MIT](LICENSE).
