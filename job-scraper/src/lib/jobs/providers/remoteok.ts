import type { JobSeed, ProviderResult } from "@/lib/jobs/types";
import { finalizeJobSeed, asDate, fetchJson } from "@/lib/jobs/providers/shared";

type RemoteOkJob = {
  id: number;
  position: string;
  company: string;
  description?: string;
  location?: string;
  date?: string;
  tags?: string[];
  url?: string;
  apply_url?: string;
  company_logo?: string;
  logo?: string;
};

function absolutizeRemoteOkImage(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  if (value.startsWith("http://") || value.startsWith("https://")) {
    return value;
  }

  return `https://remoteok.com${value}`;
}

export async function scrapeRemoteOkJobs(): Promise<ProviderResult> {
  const response = await fetchJson<Array<Record<string, unknown> | RemoteOkJob>>(
    "https://remoteok.com/api",
    {
      headers: {
        Accept: "application/json",
      },
    },
    9000,
  );

  const jobs = response
    .slice(1)
    .flatMap((job): JobSeed[] => {
      const remoteJob = job as RemoteOkJob;

      if (!remoteJob.id || !remoteJob.position || !remoteJob.company) {
        return [];
      }

      const tags = remoteJob.tags ?? [];
      const sourceUrl = remoteJob.apply_url ?? remoteJob.url;

      if (!sourceUrl) {
        return [];
      }

      const seed = finalizeJobSeed({
        externalId: String(remoteJob.id),
        provider: "remoteok",
        providerKind: "aggregator",
        providerLabel: "Remote OK",
        sourcePriority: 52,
        companyName: remoteJob.company,
        title: remoteJob.position,
        descriptionSource: remoteJob.description ?? "",
        fallbackSummary: tags.join(" · "),
        location: remoteJob.location ?? "Remote",
        employmentType: null,
        remote: true,
        sourceUrl,
        applicationUrl: sourceUrl,
        companyWebsite: null,
        pictureUrl: absolutizeRemoteOkImage(remoteJob.company_logo ?? remoteJob.logo),
        postedAt: asDate(remoteJob.date),
        tags,
      });

      return seed ? [seed] : [];
    });

  return {
    provider: "remoteok",
    fetched: jobs.length,
    jobs,
    errors: [],
  };
}
