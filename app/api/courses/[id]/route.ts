import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb, tables } from "@/lib/db";

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const db = getDb();
  await db.delete(tables.courses).where(eq(tables.courses.id, id));
  return NextResponse.json({ ok: true });
}
