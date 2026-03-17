import type { JobSeed } from "@/lib/jobs/types";
import { classifyRoles } from "@/lib/jobs/roles";
import { compactWhitespace, stripHtml, summarizeText } from "@/lib/jobs/text";
import { getDomain, isAggregatorUrl, isAtsUrl } from "@/lib/jobs/normalize";

type SeedDraft = Omit<JobSeed, "description" | "shortDescription" | "primaryRole" | "matchedRoles"> & {
  descriptionSource: string;
  fallbackSummary?: string;
};

export async function fetchJson<T>(
  url: string,
  init?: RequestInit,
  timeoutMs = 7000,
): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      Accept: "application/json",
      "User-Agent": "job-scraper/1.0 (+https://localhost)",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }

  return (await response.json()) as T;
}

export function asDate(value: string | null | undefined): Date | null {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function inferCompanyWebsite(url: string | null | undefined): string | null {
  const safeUrl = url ?? null;
  const domain = getDomain(safeUrl);

  if (!safeUrl || !domain) {
    return null;
  }

  if (isAggregatorUrl(safeUrl) || isAtsUrl(safeUrl)) {
    return null;
  }

  return new URL(safeUrl).origin;
}

export function finalizeJobSeed(draft: SeedDraft): JobSeed | null {
  const description = stripHtml(draft.descriptionSource);
  const fallback = compactWhitespace(
    [draft.fallbackSummary, draft.location, draft.employmentType, draft.remote ? "Remote" : ""]
      .filter(Boolean)
      .join(" · "),
  );
  const bestDescription = description || fallback;
  const tags = draft.tags.filter(Boolean);
  const { primaryRole, matchedRoles } = classifyRoles(
    draft.title,
    `${bestDescription} ${tags.join(" ")}`,
    tags,
  );

  if (!primaryRole) {
    return null;
  }

  return {
    ...draft,
    description: bestDescription,
    shortDescription: summarizeText(bestDescription || draft.title),
    primaryRole,
    matchedRoles,
  };
}
