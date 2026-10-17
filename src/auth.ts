import { OAuth2Client, CodeChallengeMethod, type Credentials } from "google-auth-library";
import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { z } from "zod";
import { Store } from "./storage.js";
import { AppError } from "./errors.js";
import { baseScopes, scopePrefix } from "./schema.js";

const configSchema = z.object({
  clientId: z.string().endsWith(".apps.googleusercontent.com"),
  clientSecret: z.string().min(1),
  nutritionWrite: z.boolean(),
});
export type Config = z.infer<typeof configSchema>;
export type TokenRecord = { credentials: Credentials; scopes: string[]; accountId: string; scopeCheckRequired?: boolean };
export function browser(url: string) {
  const command = process.platform === "darwin" ? "open" : process.platform === "win32" ? "rundll32.exe" : "xdg-open";
  const args = process.platform === "win32" ? ["url.dll,FileProtocolHandler", url] : [url];
  const child = spawn(command, args, { stdio: "ignore", detached: true, shell: false });
  child.on("error", () => { process.stderr.write("Open the displayed sign-in URL in your system browser.\n"); });
  child.unref();
}
type AuthRuntime = {
  client?: (config: Config, redirect?: string) => OAuth2Client;
  fetch?: typeof fetch;
  onAuthorize?: (url: string) => void;
  openBrowser?: (url: string) => void;
  timeoutMs?: number;
};
export class Auth {
  constructor(public store: Store, private runtime: AuthRuntime = {}) {}
  private client(config: Config, redirect?: string) {
    return this.runtime.client?.(config, redirect) || new OAuth2Client(config.clientId, config.clientSecret, redirect);
  }
  async config() {
    const value = await this.store.read("config.json");
    if (!value) throw new AppError("NOT_CONFIGURED", "Run setup --credentials /absolute/path/client.json first.");
    const parsed = configSchema.safeParse(value);
    if (!parsed.success) throw new AppError("CONFIG", "Invalid local configuration. Run setup again.");
    return parsed.data;
  }
  async setup(file: string, nutritionWrite: boolean) {
    let input: { installed?: { client_id?: string; client_secret?: string } };
    try { input = JSON.parse(await readFile(file, "utf8")); }
    catch { throw new AppError("CONFIG", "Cannot read credentials JSON. Download a Desktop app OAuth client."); }
    if (!input.installed) throw new AppError("CONFIG", "Use a Desktop app OAuth client, not a Web application client.");
    const config = configSchema.parse({ clientId: input.installed.client_id, clientSecret: input.installed.client_secret, nutritionWrite });
    await this.store.locked("session", () => this.store.locked("auth", async () => {
      await this.store.write("config.json", config);
      // A changed client/scope configuration must never reuse old account authorization.
      await this.store.remove("tokens.json");
    }));
    return { configured: true, nutritionWrite, next: "Run auth in your terminal." };
  }
  async login(open = true) {
    return this.store.locked("session", () => this.store.locked("auth", async () => {
      const config = await this.config();
      const state = randomBytes(32).toString("hex");
      const server = createServer();
      await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, "127.0.0.1", resolve);
      });
      const address = server.address();
      if (!address || typeof address === "string") { server.close(); throw new AppError("OAUTH", "Cannot open local callback."); }
      const redirect = "http://127.0.0.1:" + address.port + "/callback";
      const client = this.client(config, redirect);
      const codes = await client.generateCodeVerifierAsync();
      const scopes = [...baseScopes, ...(config.nutritionWrite ? ["nutrition.writeonly"] : [])].map(s => scopePrefix + s);
      const url = client.generateAuthUrl({
        access_type: "offline", prompt: "consent", scope: scopes, state,
        code_challenge: codes.codeChallenge, code_challenge_method: CodeChallengeMethod.S256,
      });
      try {
        const code = await new Promise<string>((resolve, reject) => {
          const timer = setTimeout(() => { reject(new AppError("OAUTH_TIMEOUT", "Sign-in timed out. Run auth again.")); }, this.runtime.timeoutMs ?? 180000);
          server.on("request", (req, res) => {
            const u = new URL(req.url || "/", redirect);
            const headers = { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };
            if (req.method !== "GET" || u.pathname !== "/callback") { res.writeHead(404, headers).end("Not found"); return; }
            if (u.searchParams.get("state") !== state) { res.writeHead(400, headers).end("Invalid sign-in state"); return; }
            const code = u.searchParams.get("code");
            if (u.searchParams.has("error") || !code) {
              clearTimeout(timer); res.writeHead(400, headers).end("Authorization was not granted. Return to the terminal.");
              reject(new AppError("OAUTH_DENIED", "Google authorization was not granted.")); return;
            }
            clearTimeout(timer);
            res.writeHead(200, headers).end("Authorization received. Return to the terminal to check whether token storage succeeded.");
            resolve(code);
          });
          process.stderr.write("This tool reads Fitbit-synced health data. Results requested by an AI client may go to its provider.\n");
          process.stderr.write(config.nutritionWrite ? "Nutrition and water writes are enabled; saving still requires a preview and explicit commit.\n" : "Read-only configuration.\n");
          process.stderr.write("Sign in: " + url + "\n");
          this.runtime.onAuthorize?.(url);
          if (open) (this.runtime.openBrowser || browser)(url);
        });
        const { tokens } = await client.getToken({ code, codeVerifier: codes.codeVerifier });
        if (!tokens.access_token || !tokens.refresh_token) throw new AppError("OAUTH", "No offline token returned. Revoke the old grant in Google Account settings and run auth again.");
        const info = await client.getTokenInfo(tokens.access_token);
        const identityResponse = await (this.runtime.fetch || fetch)("https://health.googleapis.com/v4/users/me/identity", {
          headers: { Authorization: "Bearer " + tokens.access_token }, signal: AbortSignal.timeout(20000), redirect: "error",
        });
        if (!identityResponse.ok) throw new AppError("IDENTITY", "Google Health identity is unavailable. Sign in to Google Health mobile first and check granted health permissions.");
        const identity = await identityResponse.json() as { healthUserId?: string };
        if (!identity.healthUserId) throw new AppError("IDENTITY", "No Google Health identity returned.");
        await this.store.write("tokens.json", { credentials: tokens, scopes: info.scopes, accountId: identity.healthUserId });
        return { connected: true, grantedScopes: info.scopes.map(s => s.replace(scopePrefix, "")) };
      } catch (e) {
        if (e instanceof AppError) throw e;
        throw new AppError("OAUTH", "Google sign-in failed. Check API enablement, consent screen, test user, and Desktop client.");
      } finally { server.closeAllConnections(); server.close(); }
    }));
  }
  async record() { return this.store.read<TokenRecord>("tokens.json"); }
  async accessToken(force = false): Promise<string> {
    return this.store.locked("auth", async () => {
      const config = await this.config(), record = await this.record();
      if (!record?.credentials.refresh_token) throw new AppError("AUTH_REQUIRED", "Run auth in your terminal.");
      const valid = !!record.credentials.access_token && (record.credentials.expiry_date || 0) > Date.now() + 60000;
      if (!force && valid && !record.scopeCheckRequired) return record.credentials.access_token!;
      try {
        const client = this.client(config);
        client.setCredentials(record.credentials);
        const credentials = !force && valid ? record.credentials : (await client.refreshAccessToken()).credentials;
        if (!credentials.access_token) throw new AppError("AUTH_RESPONSE", "Google returned no usable access token.");
        const next: TokenRecord = { credentials: { ...credentials, refresh_token: credentials.refresh_token || record.credentials.refresh_token }, scopes: [], accountId: record.accountId, scopeCheckRequired: true };
        // Save rotated credentials before metadata lookup; a transient info failure must not lose them.
        await this.store.write("tokens.json", next);
        const info = await client.getTokenInfo(credentials.access_token);
        next.scopes = info.scopes; next.scopeCheckRequired = false;
        await this.store.write("tokens.json", next);
        return credentials.access_token;
      } catch (error) {
        if (error instanceof AppError) throw error;
        const code = (error as { response?: { data?: { error?: string } } })?.response?.data?.error;
        if (code === "invalid_grant" || code === "invalid_token") {
          await this.store.remove("tokens.json");
          throw new AppError("AUTH_EXPIRED", "Google authorization expired or was revoked. Run auth again; Testing grants commonly expire after 7 days.");
        }
        if (code === "invalid_client") throw new AppError("AUTH_CLIENT", "Google rejected the OAuth client. Check Desktop credentials and run setup/auth again.");
        throw new AppError("AUTH_NETWORK", "Google authorization could not be refreshed or checked. Credentials were retained; check connectivity and retry.");
      }
    });
  }
  async status() {
    const config = await this.config().catch(() => undefined), record = await this.record();
    const tokenState = !record ? "missing" : record.scopeCheckRequired ? "scope-check-needed" : !record.credentials.refresh_token ? "invalid" : (record.credentials.expiry_date || 0) > Date.now() + 60000 ? "locally-current" : "refresh-needed";
    return {
      configured: !!config, connected: !!record?.credentials.refresh_token,
      connectionCheck: "local-state-only; use doctor --live to verify network access",
      tokenState, expiresAt: record?.credentials.expiry_date ? new Date(record.credentials.expiry_date).toISOString() : null,
      nutritionWritesConfigured: !!config?.nutritionWrite,
      nutritionWritePermission: !!record?.scopes.includes(scopePrefix + "nutrition.writeonly"),
      grantedScopes: record?.scopes || [],
    };
  }
  async requireScope(scope: string) {
    await this.accessToken();
    const record = await this.record();
    if (!record?.scopes.includes(scopePrefix + scope)) throw new AppError("MISSING_SCOPE", "Missing Google permission: " + scope + ". Update consent and run auth again.");
  }
  async disconnect() {
    return this.store.locked("session", () => this.store.locked("auth", async () => {
      await this.store.remove("tokens.json");
      return { disconnectedLocally: true, remoteGrantRevoked: false, note: "Revoke the app separately in Google Account > Security > Third-party connections. Local write journals remain for reconciliation." };
    }));
  }
}
