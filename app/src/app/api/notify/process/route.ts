import { drainQueue } from "@/lib/notify";
import { HttpError, json, withRoute } from "@/lib/api-error";

export const dynamic = "force-dynamic";

export const GET = withRoute(async (request) => {
  const auth = request.headers.get("authorization");
  const secret = process.env.CRON_SECRET;

  if (secret && auth !== `Bearer ${secret}`) {
    throw new HttpError(401, "Unauthorized");
  }

  const result = await drainQueue();
  return json(result);
});

export const POST = withRoute(async (request) => {
  return GET(request, undefined);
});
