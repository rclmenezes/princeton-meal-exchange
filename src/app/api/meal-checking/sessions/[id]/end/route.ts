import { getAuthContext } from "@/lib/auth-context";
import { endMealCheckSession } from "@/lib/meal-checking";
import { NextResponse } from "next/server";

type RouteContext = { params: Promise<{ id: string }> };

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: Request, context: RouteContext) {
  const { user } = await getAuthContext(request.headers);
  if (!user) {
    return NextResponse.json(
      { error: "Sign in before ending meal checking." },
      { status: 401 },
    );
  }

  const { id } = await context.params;
  if (!UUID_PATTERN.test(id)) {
    return NextResponse.json(
      { error: "That meal-checking session is not valid." },
      { status: 400 },
    );
  }

  const ended = await endMealCheckSession(id, user.id);
  if (!ended) {
    return NextResponse.json(
      { error: "This session has already ended or belongs to another user." },
      { status: 404 },
    );
  }

  return NextResponse.json(ended);
}
