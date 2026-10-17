import { it, expect } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
it("connects via real stdio and completes a synthetic meal roundtrip", async () => {
  const client = new Client({ name: "fitbit-mcp-ci", version: "1" });
  const transport = new StdioClientTransport({ command: process.execPath, args: [resolve("dist/cli.js"), "serve", "--demo"], stderr: "pipe" });
  await client.connect(transport);
  try {
    const list = await client.listTools();
    expect(list.tools.map(t => t.name)).toContain("fitbit_preview_meal");
    const invoke = async (name: string, args: Record<string, unknown> = {}) => {
      const r = await client.callTool({ name, arguments: args });
      expect(r.isError).not.toBe(true);
      return JSON.parse((r.content as { type: string; text: string }[])[0].text);
    };
    expect((await invoke("fitbit_status")).demo).toBe(true);
    const requestId = randomUUID();
    await invoke("fitbit_preview_meal", { requestId, at: "2026-10-17T13:00:00+03:00", mealType: "LUNCH", dishes: [{ name: "Synthetic rice", grams: 100, kcal: 130, protein: 2.7, fat: 0.3, carbs: 28, source: "user-provided" }] });
    expect((await invoke("fitbit_commit", { operationId: requestId, confirm: true })).items[0].state).toBe("verified");
    expect((await invoke("fitbit_remove", { operationId: requestId, confirm: true })).items[0].state).toBe("deleted");
  } finally { await client.close(); }
}, 20000);
