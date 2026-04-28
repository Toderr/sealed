import { createClient } from "@insforge/sdk";

const PROJECT_PREFIX = "sealed";

const url = process.env.INSFORGE_URL ?? "http://localhost:7130";
const accessKey = process.env.INSFORGE_ACCESS_API_KEY;

if (!accessKey) {
  throw new Error(
    "INSFORGE_ACCESS_API_KEY missing. Copy it from E:/Claude Code/insforge/.env into sealed/app/.env.local."
  );
}

export const insforge = createClient({
  baseUrl: url,
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-expect-error accessApiKey is a valid runtime field not in the SDK types
  accessApiKey: accessKey,
});

export function table(name: string): string {
  return `${PROJECT_PREFIX}_${name}`;
}

export { PROJECT_PREFIX };
