import { ensureDevelopmentAuthUser, getAuthContext } from "@/lib/auth-context";
import { startMealCheckSession } from "@/lib/meal-checking";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const { user, authBypassed } = await getAuthContext(request.headers);
  if (!user) {
    return NextResponse.json(
      { error: "Sign in before starting meal checking." },
      { status: 401 },
    );
  }

  if (authBypassed) {
    await ensureDevelopmentAuthUser();
  }

  // TODO(flow-5): Require an admin role and associate this session with the
  // admin's establishment before meal checking is released to production.
  const checkingSession = await startMealCheckSession(user.id);

  return NextResponse.json({
    id: checkingSession.id,
    startedAt: checkingSession.startedAt,
  });
}
