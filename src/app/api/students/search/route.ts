import { db } from "@/db";
import { user } from "@/db/schema";
import { auth } from "@/lib/auth";
import { searchGraphUsers } from "@/lib/graph";
import { and, ilike, inArray, ne, or, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return NextResponse.json(
      { error: "Sign in is required." },
      { status: 401 },
    );
  }

  const query = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (query.length < 2) return NextResponse.json({ students: [] });

  try {
    const graphUsers = await searchGraphUsers(query);
    if (graphUsers) {
      const emails = graphUsers.map((person) =>
        (person.mail ?? person.userPrincipalName).toLowerCase(),
      );
      const rosterUsers =
        emails.length === 0
          ? []
          : await db
              .select({
                id: user.id,
                email: user.email,
                eligible: user.isExchangeEligible,
              })
              .from(user)
              .where(inArray(sql<string>`lower(${user.email})`, emails));
      const rosterByEmail = new Map(
        rosterUsers.map((person) => [person.email.toLowerCase(), person]),
      );

      return NextResponse.json({
        students: graphUsers
          .filter(
            (person) =>
              (person.mail ?? person.userPrincipalName).toLowerCase() !==
              session.user.email.toLowerCase(),
          )
          .map((person) => {
            const email = (
              person.mail ?? person.userPrincipalName
            ).toLowerCase();
            const roster = rosterByEmail.get(email);
            return {
              id: roster?.id ?? `unavailable:${person.id}`,
              name: person.displayName,
              email,
              eligible: roster?.eligible ?? false,
              eligibilityMessage: roster
                ? roster.eligible
                  ? "Eligible for meal exchange"
                  : "Not eligible for meal exchange"
                : "Not found in the latest eligibility roster",
            };
          }),
      });
    }

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
          ne(user.id, session.user.id),
          or(ilike(user.name, `%${query}%`), ilike(user.email, `%${query}%`)),
        ),
      )
      .limit(8);

    return NextResponse.json({
      students: students.map((student) => ({
        ...student,
        eligibilityMessage: student.eligible
          ? "Eligible for meal exchange"
          : "Not eligible for meal exchange",
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
