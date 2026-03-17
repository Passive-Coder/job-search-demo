import type { JobSeed, ProviderResult } from "@/lib/jobs/types";
import { finalizeJobSeed, asDate, fetchJson } from "@/lib/jobs/providers/shared";

type RemotiveJob = {
  id: number;
  title: string;
  company_name: string;
  company_logo_url?: string;
  description?: string;
  candidate_required_location?: string;
  publication_date?: string;
  job_type?: string;
  url?: string;
  tags?: string[];
};

type RemotiveResponse = {
  jobs: RemotiveJob[];
};

export async function scrapeRemotiveJobs(): Promise<ProviderResult> {
  const response = await fetchJson<RemotiveResponse>("https://remotive.com/api/remote-jobs", undefined, 9000);

  const jobs = response.jobs.flatMap((job): JobSeed[] => {
    if (!job.url) {
      return [];
    }

    const tags = job.tags ?? [];

    const seed = finalizeJobSeed({
      externalId: String(job.id),
      provider: "remotive",
      providerKind: "aggregator",
      providerLabel: "Remotive",
      sourcePriority: 40,
      companyName: job.company_name,
      title: job.title,
      descriptionSource: job.description ?? "",
      fallbackSummary: [job.job_type, ...tags].filter(Boolean).join(" · "),
      location: job.candidate_required_location ?? "Remote",
      employmentType: job.job_type ?? null,
      remote: true,
      sourceUrl: job.url,
      applicationUrl: job.url,
      companyWebsite: null,
      pictureUrl: job.company_logo_url ?? null,
      postedAt: asDate(job.publication_date),
      tags,
    });

    return seed ? [seed] : [];
  });

  return {
    provider: "remotive",
    fetched: jobs.length,
    jobs,
    errors: [],
  };
}
