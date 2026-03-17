import { NextResponse } from "next/server";

import { runScrapeCycle } from "@/lib/jobs/service";

export async function POST() {
  try {
    const result = await runScrapeCycle();
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to run scrape cycle.",
      },
      {
        status: 500,
      },
    );
  }
}
