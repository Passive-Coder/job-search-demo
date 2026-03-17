import pLimit from "p-limit";

import { GREENHOUSE_BOARDS } from "@/lib/jobs/source-config";
import type { JobSeed, ProviderResult } from "@/lib/jobs/types";
import { finalizeJobSeed, asDate, fetchJson, inferCompanyWebsite } from "@/lib/jobs/providers/shared";

type GreenhouseJob = {
  id: number;
  title: string;
  absolute_url: string;
  content: string;
  first_published?: string;
  company_name?: string;
  location?: { name?: string };
  departments?: Array<{ name?: string }>;
  offices?: Array<{ name?: string }>;
};

type GreenhouseResponse = {
  jobs: GreenhouseJob[];
};

export async function scrapeGreenhouseJobs(): Promise<ProviderResult> {
  const limit = pLimit(12);
  const errors: string[] = [];

  const settled = await Promise.allSettled(
    GREENHOUSE_BOARDS.map((board) =>
      limit(async () => {
        const response = await fetchJson<GreenhouseResponse>(
          `https://boards-api.greenhouse.io/v1/boards/${board.id}/jobs?content=true`,
        );

        return response.jobs.flatMap((job): JobSeed[] => {
          const tags = [
            ...(job.departments ?? []).map((entry) => entry.name ?? ""),
            ...(job.offices ?? []).map((entry) => entry.name ?? ""),
          ].filter(Boolean);

          const seed = finalizeJobSeed({
            externalId: String(job.id),
            provider: "greenhouse",
            providerKind: "ats",
            providerLabel: "Greenhouse",
            sourcePriority: 98,
            companyName: job.company_name ?? board.label,
            title: job.title,
            descriptionSource: job.content ?? "",
            fallbackSummary: `${board.label} engineering opening`,
            location: job.location?.name ?? "Global",
            employmentType: null,
            remote: /remote/i.test(job.location?.name ?? "") || /remote/i.test(job.title),
            sourceUrl: job.absolute_url,
            applicationUrl: job.absolute_url,
            companyWebsite: inferCompanyWebsite(job.absolute_url),
            pictureUrl: null,
            postedAt: asDate(job.first_published),
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
    provider: "greenhouse",
    fetched: jobs.length,
    jobs,
    errors,
  };
}
