import { NextRequest } from "next/server";
import { drainQueue } from "@/lib/notify";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  const secret = process.env.CRON_SECRET;

  if (secret && auth !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await drainQueue();
  return Response.json(result);
}

export async function POST(request: NextRequest) {
  return GET(request);
}
