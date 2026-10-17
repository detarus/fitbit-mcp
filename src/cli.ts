#!/usr/bin/env node
import { parseArgs } from "node:util";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { Store } from "./storage.js";
import { Auth } from "./auth.js";
import { GoogleHealth, DemoHealth } from "./api.js";
import { Operations } from "./operations.js";
import { createMcp } from "./server.js";
import { report, compareReports, comparisonRange, domainsSchema } from "./reports.js";
import { publicError } from "./errors.js";
import { typeSchema, rangeSchema } from "./schema.js";

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: { credentials: { type: "string" }, "nutrition-write": { type: "boolean" }, "no-open": { type: "boolean" }, live: { type: "boolean" }, demo: { type: "boolean" }, type: { type: "string" }, start: { type: "string" }, end: { type: "string" }, "domains": { type: "string" }, "previous-start": { type: "string" }, "previous-end": { type: "string" }, client: { type: "string" }, help: { type: "boolean" } },
  });
  const command = positionals[0] || "serve";
  if (values.help || command === "help") {
    console.log("fitbit-mcp: setup --credentials /absolute/client.json [--nutrition-write]; auth [--no-open]; doctor [--live]; serve [--demo]; demo; demo-check; read --type steps --start YYYY-MM-DD --end YYYY-MM-DD; report --start YYYY-MM-DD --end YYYY-MM-DD [--demo]; compare --start YYYY-MM-DD --end YYYY-MM-DD [--demo]; install --client codex|claude; disconnect");
    return;
  }
  const demo = command === "demo" || command === "demo-check" || !!values.demo;
  const temp = demo ? await mkdtemp(join(tmpdir(), "fitbit-mcp-demo-")) : undefined;
  const store = new Store(temp); await store.init();
  const auth = new Auth(store);
  const api = demo ? new DemoHealth() : new GoogleHealth(auth);
  const ops = new Operations(store, api, async () => demo || (await auth.config()).nutritionWrite);
  if (command === "serve" || command === "demo") {
    const server = createMcp(api, ops, demo ? undefined : auth);
    if (temp) {
      process.once("exit", () => { /* Demo journals stay isolated in the OS temporary directory. */ });
      process.once("SIGINT", () => { void server.close().then(() => rm(temp, { recursive: true, force: true })).finally(() => process.exit(0)); });
    }
    await server.connect(new StdioServerTransport());
    return;
  }
  try {
    let output: unknown;
    if (command === "setup") {
      if (!values.credentials) throw new Error("Missing --credentials");
      output = await auth.setup(resolve(values.credentials), !!values["nutrition-write"]);
    } else if (command === "auth") output = await auth.login(!values["no-open"]);
    else if (command === "disconnect") output = await auth.disconnect();
    else if (command === "doctor") {
      const config = await auth.config().catch(() => undefined), token = await auth.record();
      output = { node: process.versions.node, platform: process.platform, configured: !!config, connected: !!token, nutritionWrites: !!config?.nutritionWrite, grantedScopes: token?.scopes || [], storage: "Per-user local files, not encrypted by this application", live: values.live ? { reachable: !!await api.info() } : "Not requested" };
    } else if (command === "report" || command === "compare") {
      const range = rangeSchema.parse({ startDate: values.start, endDate: values.end });
      const domains = domainsSchema.parse(values.domains?.split(","));
      if (command === "report") output = await report(api, range.startDate, range.endDate, domains);
      else {
        const previous = comparisonRange(range.startDate, range.endDate, values["previous-start"], values["previous-end"]);
        output = compareReports(await report(api, range.startDate, range.endDate, domains), await report(api, previous.startDate, previous.endDate, domains));
      }
    } else if (command === "read") {
      const type = typeSchema.parse(values.type), range = rangeSchema.parse({ startDate: values.start, endDate: values.end });
      output = await api.points(type, range.startDate, range.endDate);
    } else if (command === "install") {
      if (!["codex", "claude"].includes(values.client || "")) throw new Error("Choose --client codex or --client claude");
      const client = values.client!;
      const script = fileURLToPath(import.meta.url);
      const args = client === "codex" ? ["mcp", "add", "fitbit", "--", process.execPath, script, "serve"] : ["mcp", "add", "--scope", "user", "--transport", "stdio", "fitbit", "--", process.execPath, script, "serve"];
      // No shell interpolation; modifies only the user's selected MCP client configuration.
      await promisify(execFile)(client, args, { windowsHide: true });
      output = { installed: client, note: "Restart the client and ask it to call fitbit_status. Plugin skills can be installed separately; avoid registering the MCP twice." };
    } else if (command === "demo-check") {
      const requestId = randomUUID();
      const draft = await ops.preview("meal", { requestId, at: "2026-10-17T13:00:00+03:00", mealType: "LUNCH", dishes: [{ name: "Demo chicken", grams: 100, kcal: 165, protein: 31, fat: 3.6, carbs: 0, source: "user-provided" }] });
      const saved = await ops.commit(requestId, true), repeated = await ops.commit(requestId, true), removed = await ops.remove(requestId, true);
      if (!saved.items.every(i => i.state === "verified") || !removed.items.every(i => i.state === "deleted")) throw new Error("Demo verification failed");
      output = { demo: true, googleRequests: 0, preview: draft, saved, duplicateRetry: repeated, removed };
    } else throw new Error("Unknown command");
    console.log(JSON.stringify(output, null, 2));
  } finally { if (temp) await rm(temp, { recursive: true, force: true }); }
}
main().catch(error => {
  process.stderr.write(JSON.stringify(publicError(error)) + "\n");
  process.exitCode = 1;
});
