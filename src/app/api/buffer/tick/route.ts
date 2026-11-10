import { NextResponse } from "next/server";
import { runTick } from "@/lib/buffer/scheduler";

/**
 * Manual trigger of the buffer-cabin watchdog (also runs every minute via
 * node-cron). Handy for demos: voids every expired BUFFERING order.
 */
export async function POST() {
  const result = await runTick();
  return NextResponse.json(result);
}

export async function GET() {
  const result = await runTick();
  return NextResponse.json(result);
}
