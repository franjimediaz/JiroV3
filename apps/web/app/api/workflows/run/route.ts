// app/api/workflow/run/route.ts
import { NextRequest, NextResponse } from "next/server";
import { runWorkflow } from "@/lib/workflows/runWorkflow";

export async function POST(req: NextRequest) {
  try {
    const { workflowKey, context, input } = await req.json();

    if (!workflowKey) {
      return NextResponse.json({ ok: false, error: "workflowKey requerido" }, { status: 400 });
    }
    if (!context?.recordId) {
      return NextResponse.json({ ok: false, error: "context.recordId requerido" }, { status: 400 });
    }

    const out = await runWorkflow({ workflowKey, context, input });

    return NextResponse.json({ ok: true, ...out });
  } catch (e: any) {
    console.error("POST /api/workflow/run error:", e);
    return NextResponse.json(
      { ok: false, error: e?.message || "Error interno" },
      { status: 500 }
    );
  }
}
