import { ROSTER_CSV_TEMPLATE } from "@/lib/roster";

export async function GET() {
  return new Response(ROSTER_CSV_TEMPLATE, {
    headers: {
      "content-disposition": 'attachment; filename="meal-exchange-roster.csv"',
      "content-type": "text/csv; charset=utf-8",
    },
  });
}
