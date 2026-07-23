import { auth } from "@/lib/auth";
import { startMealCheckSession } from "@/lib/meal-checking";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return NextResponse.json(
      { error: "Sign in before starting meal checking." },
      { status: 401 },
    );
  }

  // TODO(flow-5): Require an admin role and associate this session with the
  // admin's establishment before meal checking is released to production.
  const checkingSession = await startMealCheckSession(session.user.id);

  return NextResponse.json({
    id: checkingSession.id,
    startedAt: checkingSession.startedAt,
  });
}
