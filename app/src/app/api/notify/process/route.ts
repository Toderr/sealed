import { drainQueue } from "@/lib/notify";

export async function POST() {
  const result = await drainQueue();
  return Response.json(result);
}
