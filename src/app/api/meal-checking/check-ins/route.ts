import { auth } from "@/lib/auth";
import {
  checkInExchange,
  MealCheckError,
  type MealCheckFailure,
} from "@/lib/meal-checking";
import { NextResponse } from "next/server";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const failureStatuses: Record<MealCheckFailure, number> = {
  invalid_code: 400,
  not_found: 404,
  not_accepted: 409,
  already_completed: 409,
  wrong_date: 409,
  inactive_session: 409,
  concurrent_check_in: 409,
};

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return NextResponse.json(
      { error: "Sign in before checking in a guest." },
      { status: 401 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const input = body as { sessionId?: unknown; code?: unknown } | null;
  if (!input || typeof input.sessionId !== "string") {
    return NextResponse.json(
      { error: "A meal-checking session is required." },
      { status: 400 },
    );
  }
  if (!UUID_PATTERN.test(input.sessionId)) {
    return NextResponse.json(
      { error: "That meal-checking session is not valid." },
      { status: 400 },
    );
  }

  try {
    // TODO(flow-5): Also verify the checker is an admin for the exchange's
    // establishment once admin roles and establishment ownership exist.
    const completed = await checkInExchange({
      code: input.code,
      sessionId: input.sessionId,
      checkerUserId: session.user.id,
    });
    return NextResponse.json(completed);
  } catch (error) {
    if (error instanceof MealCheckError) {
      return NextResponse.json(
        { error: error.message, reason: error.reason },
        { status: failureStatuses[error.reason] },
      );
    }
    throw error;
  }
}
