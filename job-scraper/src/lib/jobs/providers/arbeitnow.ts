import pLimit from "p-limit";

import { ARBEITNOW_PAGE_COUNT } from "@/lib/jobs/source-config";
import type { JobSeed, ProviderResult } from "@/lib/jobs/types";
import { finalizeJobSeed, asDate, fetchJson } from "@/lib/jobs/providers/shared";

type ArbeitnowJob = {
  slug: string;
  company_name: string;
  title: string;
  description: string;
  location: string;
  remote: boolean;
  url: string;
  created_at?: string;
  tags: string[];
  job_types: string[];
};

type ArbeitnowResponse = {
  data: ArbeitnowJob[];
};

function buildArbeitnowImage(title: string, companyName: string) {
  const encodedTitle = encodeURIComponent(title);
  const encodedCompany = encodeURIComponent(companyName);

  return `https://og-images.arbeitnow.com/${encodedTitle}.png?company_name=${encodedCompany}`;
}

export async function scrapeArbeitnowJobs(): Promise<ProviderResult> {
  const errors: string[] = [];
  const pageLimit = pLimit(4);

  const settled = await Promise.allSettled(
    Array.from({ length: ARBEITNOW_PAGE_COUNT }, (_, index) => index + 1).map((page) =>
      pageLimit(async () => {
        const response = await fetchJson<ArbeitnowResponse>(
          `https://www.arbeitnow.com/api/job-board-api?page=${page}`,
        );

        return response.data.flatMap((job): JobSeed[] => {
          const tags = [...job.tags, ...job.job_types].filter(Boolean);

          const seed = finalizeJobSeed({
            externalId: job.slug,
            provider: "arbeitnow",
            providerKind: "aggregator",
            providerLabel: "Arbeitnow",
            sourcePriority: 60,
            companyName: job.company_name,
            title: job.title,
            descriptionSource: job.description,
            fallbackSummary: tags.join(" · "),
            location: job.location || (job.remote ? "Remote" : "Global"),
            employmentType: job.job_types[0] ?? null,
            remote: job.remote,
            sourceUrl: job.url,
            applicationUrl: job.url,
            companyWebsite: null,
            pictureUrl: buildArbeitnowImage(job.title, job.company_name),
            postedAt: asDate(job.created_at),
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
    provider: "arbeitnow",
    fetched: jobs.length,
    jobs,
    errors,
  };
}
