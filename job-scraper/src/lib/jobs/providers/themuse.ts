import pLimit from "p-limit";

import { THE_MUSE_PAGE_COUNT } from "@/lib/jobs/source-config";
import type { JobSeed, ProviderResult } from "@/lib/jobs/types";
import { finalizeJobSeed, asDate, fetchJson } from "@/lib/jobs/providers/shared";

type MuseJob = {
  id: number;
  name: string;
  contents: string;
  publication_date?: string;
  refs?: {
    landing_page?: string;
  };
  company?: {
    name?: string;
  };
  locations?: Array<{ name?: string }>;
  categories?: Array<{ name?: string }>;
  levels?: Array<{ name?: string }>;
  tags?: Array<{ name?: string }>;
};

type MuseResponse = {
  results: MuseJob[];
};

export async function scrapeTheMuseJobs(): Promise<ProviderResult> {
  const pageLimit = pLimit(4);
  const errors: string[] = [];

  const settled = await Promise.allSettled(
    Array.from({ length: THE_MUSE_PAGE_COUNT }, (_, index) => index + 1).map((page) =>
      pageLimit(async () => {
        const response = await fetchJson<MuseResponse>(
          `https://www.themuse.com/api/public/jobs?page=${page}`,
        );

        return response.results.flatMap((job): JobSeed[] => {
          const tags = [
            ...(job.categories ?? []).map((entry) => entry.name ?? ""),
            ...(job.levels ?? []).map((entry) => entry.name ?? ""),
            ...(job.tags ?? []).map((entry) => entry.name ?? ""),
          ].filter(Boolean);

          const sourceUrl = job.refs?.landing_page;

          if (!sourceUrl || !job.company?.name) {
            return [];
          }

          const seed = finalizeJobSeed({
            externalId: String(job.id),
            provider: "themuse",
            providerKind: "aggregator",
            providerLabel: "The Muse",
            sourcePriority: 44,
            companyName: job.company.name,
            title: job.name,
            descriptionSource: job.contents ?? "",
            fallbackSummary: tags.join(" · "),
            location: job.locations?.map((entry) => entry.name ?? "").filter(Boolean).join(" · ") || "Global",
            employmentType: null,
            remote: /remote/i.test(job.name) || /remote/i.test(job.contents ?? ""),
            sourceUrl,
            applicationUrl: sourceUrl,
            companyWebsite: null,
            pictureUrl: null,
            postedAt: asDate(job.publication_date),
            tags,
          });

          return seed ? [seed] : [];
        });
      }),
    ),
  );

  const jobs = settled.flatMap((result) => {
    if (result.status === "fulfilled") {
      return result.value;
    }

    errors.push(result.reason instanceof Error ? result.reason.message : String(result.reason));
    return [];
  });

  return {
    provider: "themuse",
    fetched: jobs.length,
    jobs,
    errors,
  };
}
