import { NextResponse } from "next/server";

import { ALL_ROLE_VALUE, SOFTWARE_ROLES, type RoleFilterValue } from "@/lib/jobs/roles";
import { searchJobs } from "@/lib/jobs/service";

function resolveRole(value: string | null): RoleFilterValue {
  if (!value || value === ALL_ROLE_VALUE) {
    return ALL_ROLE_VALUE;
  }

  return SOFTWARE_ROLES.some((role) => role.id === value)
    ? (value as RoleFilterValue)
    : ALL_ROLE_VALUE;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = url.searchParams.get("query") ?? "";
  const location = url.searchParams.get("location") ?? "";
  const role = resolveRole(url.searchParams.get("role"));
  const limit = Number(url.searchParams.get("limit") ?? "100");
  const scrape =
    url.searchParams.get("scrape") === "1" ||
    url.searchParams.get("scrape") === "true";

  try {
    const result = await searchJobs({
      query,
      location,
      role,
      limit: Number.isFinite(limit) ? limit : 100,
      scrapeBeforeRead: scrape,
    });

    return NextResponse.json({
      items: result.items,
      meta: {
        total: result.total,
        lastSeenAt: result.lastSeenAt,
        scrape: result.scrapeSummary,
        roles: SOFTWARE_ROLES,
      },
    });
  } catch (error) {
    const rawMessage = error instanceof Error ? error.message : "Failed to load jobs.";
    const message = /vector|index|chroma/i.test(rawMessage)
      ? "The Chroma job index is unavailable. Check the Chroma env vars and retry."
      : rawMessage;

    return NextResponse.json(
      {
        error: message,
      },
      {
        status: 503,
      },
    );
  }
}
