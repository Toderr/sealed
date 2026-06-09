import { updateUserProfile } from "@/lib/sealed-users";
import { getWallet } from "@/lib/auth";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ wallet: string }> }
) {
  const { wallet } = await params;
  const callerWallet = getWallet(request);

  if (!callerWallet || callerWallet !== wallet) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json() as {
    handle?: string;
    display_name?: string;
    bio?: string;
    avatar_url?: string;
    website?: string;
    twitter_handle?: string;
    linkedin_url?: string;
    instagram_handle?: string;
    telegram_handle?: string;
    company_file_url?: string;
    company_file_name?: string;
  };

  if (!body.handle?.trim()) {
    return Response.json({ error: "handle is required" }, { status: 400 });
  }

  const result = await updateUserProfile(wallet, {
    handle: body.handle.trim().replace(/^@/, ""),
    display_name: body.display_name?.trim() || undefined,
    bio: body.bio?.trim() || undefined,
    avatar_url: body.avatar_url || undefined,
    website: body.website?.trim() || undefined,
    twitter_handle: body.twitter_handle?.trim() || undefined,
    linkedin_url: body.linkedin_url?.trim() || undefined,
    instagram_handle: body.instagram_handle?.trim() || undefined,
    telegram_handle: body.telegram_handle?.trim() || undefined,
    company_file_url: body.company_file_url || undefined,
    company_file_name: body.company_file_name?.trim() || undefined,
  });

  if (!result.ok) {
    return Response.json({ error: result.error }, { status: 409 });
  }

  return Response.json({ ok: true });
}
