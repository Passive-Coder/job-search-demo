import pLimit from "p-limit";

import {
  EXTERNAL_ROLE_SEARCH_TERMS,
  UNSTOP_PAGE_COUNT,
} from "@/lib/jobs/source-config";
import type { JobSeed, ProviderResult } from "@/lib/jobs/types";
import { asDate, fetchJson, finalizeJobSeed } from "@/lib/jobs/providers/shared";

type UnstopFilter = {
  name?: string;
};

type UnstopSkill = {
  skill_name?: string;
  skill?: string;
};

type UnstopOrganisation = {
  name?: string;
  logoUrl?: string;
  logoUrl2?: string;
};

type UnstopLocation = {
  city?: string;
  state?: string;
  country?: string;
};

type UnstopJobDetail = {
  locations?: string[];
  type?: string;
  timing?: string;
};

type UnstopJob = {
  id: number;
  title: string;
  seo_url?: string;
  public_url?: string;
  updated_at?: string;
  region?: string;
  details?: string;
  tags?: string[];
  filters?: UnstopFilter[];
  required_skills?: UnstopSkill[];
  workfunction?: Array<{ name?: string }>;
  organisation?: UnstopOrganisation;
  logoUrl2?: string;
  thumb?: string;
  locations?: UnstopLocation[];
  jobDetail?: UnstopJobDetail;
};

type UnstopResponse = {
  data: {
    data: UnstopJob[];
  };
};

function buildUnstopSearchUrl(searchTerm: string, page: number) {
  const params = new URLSearchParams({
    opportunity: "jobs",
    search: searchTerm,
    page: String(page),
  });

  return `https://api.unstop.com/api/public/opportunity/search-result?${params.toString()}`;
}

function resolveUnstopUrl(job: UnstopJob) {
  if (job.seo_url) {
    return job.seo_url;
  }

  if (job.public_url) {
    return `https://unstop.com/${job.public_url.replace(/^\/+/, "")}`;
  }

  return null;
}

function resolveUnstopLocation(job: UnstopJob) {
  const detailedLocations = (job.locations ?? [])
    .map((entry) => [entry.city, entry.state, entry.country].filter(Boolean).join(", "))
    .filter(Boolean);

  if (detailedLocations.length > 0) {
    return detailedLocations.join(" · ");
  }

  const jobDetailLocations = job.jobDetail?.locations?.filter(Boolean) ?? [];

  if (jobDetailLocations.length > 0) {
    return jobDetailLocations.join(" · ");
  }

  if (job.region === "online") {
    return "Remote";
  }

  return "India";
}

function isUnstopRemote(job: UnstopJob, location: string) {
  return (
    job.region === "online" ||
    /remote|online|work[_ -]?from[_ -]?home/i.test(job.jobDetail?.type ?? "") ||
    /remote/i.test(location)
  );
}

export async function scrapeUnstopJobs(): Promise<ProviderResult> {
  const requestLimit = pLimit(4);
  const errors: string[] = [];

  const settled = await Promise.allSettled(
    EXTERNAL_ROLE_SEARCH_TERMS.flatMap((searchTerm) =>
      Array.from({ length: UNSTOP_PAGE_COUNT }, (_, index) => index + 1).map((page) =>
        requestLimit(async () => {
          const response = await fetchJson<UnstopResponse>(
            buildUnstopSearchUrl(searchTerm, page),
            {
              headers: {
                "Accept-Language": "en-US,en;q=0.9",
              },
            },
            12000,
          );

          return response.data.data.flatMap((job): JobSeed[] => {
            const sourceUrl = resolveUnstopUrl(job);
            const companyName = job.organisation?.name?.trim();

            if (!sourceUrl || !companyName || !job.title) {
              return [];
            }

            const location = resolveUnstopLocation(job);
            const tags = [
              searchTerm,
              ...(job.tags ?? []),
              ...(job.filters ?? []).map((entry) => entry.name ?? ""),
              ...(job.required_skills ?? []).map(
                (entry) => entry.skill_name ?? entry.skill ?? "",
              ),
              ...(job.workfunction ?? []).map((entry) => entry.name ?? ""),
            ].filter(Boolean);

            const seed = finalizeJobSeed({
              externalId: String(job.id),
              provider: "unstop",
              providerKind: "aggregator",
              providerLabel: "Unstop",
              sourcePriority: 42,
              companyName,
              title: job.title.trim(),
              descriptionSource: job.details ?? "",
              fallbackSummary: tags.join(" · "),
              location,
              employmentType: job.jobDetail?.timing ?? null,
              remote: isUnstopRemote(job, location),
              sourceUrl,
              applicationUrl: sourceUrl,
              companyWebsite: null,
              pictureUrl:
                job.logoUrl2 ??
                job.organisation?.logoUrl2 ??
                job.organisation?.logoUrl ??
                job.thumb ??
                null,
              postedAt: asDate(job.updated_at),
              tags,
            });

            return seed ? [seed] : [];
          });
        }),
      ),
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
    provider: "unstop",
    fetched: jobs.length,
    jobs,
    errors,
  };
}
