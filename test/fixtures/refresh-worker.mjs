import { appendFile } from "node:fs/promises";
import { join } from "node:path";
import { Auth } from "../../dist/auth.js";
import { Store } from "../../dist/storage.js";

const directory = process.argv[2];
const auth = new Auth(new Store(directory), {
  client: () => ({
    setCredentials() {},
    async refreshAccessToken() {
      await appendFile(join(directory, "refresh-calls.log"), "refresh\n");
      await new Promise(resolve => setTimeout(resolve, 40));
      return { credentials: { access_token: "synthetic-access", refresh_token: "synthetic-rotated", expiry_date: Date.now() + 3600000 } };
    },
    async getTokenInfo() { return { scopes: ["https://www.googleapis.com/auth/googlehealth.sleep.readonly"] }; },
  }),
});
await auth.accessToken();
console.log(JSON.stringify({ refreshedOrReused: true }));
