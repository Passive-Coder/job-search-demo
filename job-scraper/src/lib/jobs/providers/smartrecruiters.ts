import pLimit from "p-limit";

import { SMART_RECRUITERS_COMPANIES } from "@/lib/jobs/source-config";
import { makeSmartRecruitersPostingUrl } from "@/lib/jobs/normalize";
import { classifyRoles } from "@/lib/jobs/roles";
import type { ProviderResult } from "@/lib/jobs/types";
import { finalizeJobSeed, asDate, fetchJson } from "@/lib/jobs/providers/shared";

type SmartRecruitersListing = {
  id: string;
  name: string;
  ref?: string;
  releasedDate?: string;
  company: {
    identifier: string;
    name: string;
  };
  location?: {
    fullLocation?: string;
    remote?: boolean;
    hybrid?: boolean;
  };
  department?: {
    label?: string;
  };
  function?: {
    label?: string;
  };
  experienceLevel?: {
    label?: string;
  };
  typeOfEmployment?: {
    label?: string;
  };
};

type SmartRecruitersListingsResponse = {
  content: SmartRecruitersListing[];
};

type SmartRecruitersDetail = {
  applyUrl?: string;
  postingUrl?: string;
  jobAd?: {
    sections?: Array<{
      title?: string;
      text?: string;
    }> | Record<string, { title?: string; text?: string }>;
  };
};

export async function scrapeSmartRecruitersJobs(): Promise<ProviderResult> {
  const errors: string[] = [];
  const companyLimit = pLimit(6);
  const detailLimit = pLimit(10);

  const settled = await Promise.allSettled(
    SMART_RECRUITERS_COMPANIES.map((company) =>
      companyLimit(async () => {
        const response = await fetchJson<SmartRecruitersListingsResponse>(
          `https://api.smartrecruiters.com/v1/companies/${company.id}/postings?limit=100&offset=0`,
        );

        const relevantListings = response.content.filter((listing) => {
          const tags = [
            listing.department?.label ?? "",
            listing.function?.label ?? "",
            listing.experienceLevel?.label ?? "",
          ].filter(Boolean);

          return Boolean(
            classifyRoles(listing.name, tags.join(" "), tags).primaryRole,
          );
        });

        const detailSettled = await Promise.allSettled(
          relevantListings.map((listing) =>
            detailLimit(async () => {
              const detail = listing.ref
                ? await fetchJson<SmartRecruitersDetail>(listing.ref)
                : null;

              const tags = [
                listing.department?.label ?? "",
                listing.function?.label ?? "",
                listing.experienceLevel?.label ?? "",
              ].filter(Boolean);

              const sections = Array.isArray(detail?.jobAd?.sections)
                ? detail.jobAd.sections
                : detail?.jobAd?.sections && typeof detail.jobAd.sections === "object"
                  ? Object.values(detail.jobAd.sections as Record<string, { title?: string; text?: string }>)
                  : [];

              const descriptionSource =
                sections
                  .map((section) => [section.title, section.text].filter(Boolean).join(" "))
                  .join(" ") ?? "";

              const fallbackUrl =
                detail?.postingUrl ??
                makeSmartRecruitersPostingUrl(company.id, listing.id, listing.name);

              const seed = finalizeJobSeed({
                externalId: listing.id,
                provider: "smartrecruiters",
                providerKind: "ats",
                providerLabel: "SmartRecruiters",
                sourcePriority: 94,
                companyName: listing.company.name ?? company.label,
                title: listing.name,
                descriptionSource,
                fallbackSummary: [
                  listing.department?.label,
                  listing.function?.label,
                  listing.experienceLevel?.label,
                ]
                  .filter(Boolean)
                  .join(" · "),
                location: listing.location?.fullLocation ?? "Global",
                employmentType: listing.typeOfEmployment?.label ?? null,
                remote: Boolean(listing.location?.remote),
                sourceUrl: fallbackUrl,
                applicationUrl: detail?.applyUrl ?? detail?.postingUrl ?? fallbackUrl,
                companyWebsite: null,
                pictureUrl: null,
                postedAt: asDate(listing.releasedDate),
                tags,
              });

              return seed;
            }),
          ),
        );

        return detailSettled.flatMap((entry) => {
          if (entry.status !== "fulfilled") {
            errors.push(entry.reason instanceof Error ? entry.reason.message : String(entry.reason));
            return [];
          }

          return entry.value ? [entry.value] : [];
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
    provider: "smartrecruiters",
    fetched: jobs.length,
    jobs,
    errors,
  };
}
