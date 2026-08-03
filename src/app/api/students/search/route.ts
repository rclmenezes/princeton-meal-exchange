import { db } from "@/db";
import { user } from "@/db/schema";
import { ensureDevelopmentAuthUser, getAuthContext } from "@/lib/auth-context";
import { and, ilike, ne, or } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const authContext = await getAuthContext(request.headers);
  if (!authContext.user) {
    return NextResponse.json(
      { error: "Sign in before searching for a student." },
      { status: 401 },
    );
  }
  if (authContext.authBypassed) await ensureDevelopmentAuthUser();
  const currentUser = authContext.user;

  const query = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (query.length < 2) {
    return NextResponse.json({ students: [], source: "eligibility-roster" });
  }

  try {
    const students = await db
      .select({
        id: user.id,
        name: user.name,
        email: user.email,
        eligible: user.isExchangeEligible,
      })
      .from(user)
      .where(
        and(
          ne(user.id, currentUser.id),
          or(ilike(user.name, `%${query}%`), ilike(user.email, `%${query}%`)),
        ),
      )
      .limit(8);

    return NextResponse.json({
      students: students.map((student) => ({
        ...student,
        eligibilityMessage: student.eligible
          ? "Eligible for meal exchange"
          : "Eligibility not confirmed",
      })),
      source: "eligibility-roster",
    });
  } catch (error) {
    console.error("Student search failed", error);
    return NextResponse.json(
      { error: "Student search is temporarily unavailable." },
      { status: 503 },
    );
  }
}
