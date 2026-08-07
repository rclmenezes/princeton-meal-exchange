import { hasValidMutationOrigin } from "@/lib/admin-audit";
import {
  canManageRoster,
  getManagementContext,
} from "@/lib/admin-authorization";
import { MAX_ROSTER_BYTES, previewRoster } from "@/lib/roster";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  if (!hasValidMutationOrigin(request)) {
    return NextResponse.json(
      { error: "Invalid request origin." },
      { status: 403 },
    );
  }

  const form = await request.formData();
  const file = form.get("file");
  const establishmentId = form.get("establishmentId");
  if (!(file instanceof File) || typeof establishmentId !== "string") {
    return NextResponse.json(
      { error: "Choose a CSV file and eating club." },
      { status: 400 },
    );
  }
  if (file.size > MAX_ROSTER_BYTES) {
    return NextResponse.json(
      { error: "Roster CSV files must be 2 MB or smaller." },
      { status: 413 },
    );
  }

  const context = await getManagementContext(request.headers, establishmentId);
  if (
    !context ||
    !canManageRoster(context) ||
    context.establishmentId !== establishmentId
  ) {
    return NextResponse.json({ error: "Roster not found." }, { status: 404 });
  }

  try {
    const preview = await previewRoster(await file.text(), establishmentId);
    return NextResponse.json(preview);
  } catch (error) {
    console.error("Roster preview failed", error);
    return NextResponse.json(
      { error: "The roster could not be previewed." },
      { status: 422 },
    );
  }
}
