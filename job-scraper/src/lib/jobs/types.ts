import type { SoftwareRoleId } from "@/lib/jobs/roles";

export type ProviderId =
  | "greenhouse"
  | "smartrecruiters"
  | "arbeitnow"
  | "remoteok"
  | "themuse"
  | "remotive"
  | "linkedin"
  | "unstop";

export type ProviderKind = "ats" | "aggregator";

export type SourceSnapshot = {
  provider: string;
  providerKind: string;
  providerLabel: string;
  externalId: string;
  sourceUrl: string;
  applicationUrl: string | null;
  priority: number;
  capturedAt: string;
};

export type JobSeed = {
  externalId: string;
  provider: ProviderId;
  providerKind: ProviderKind;
  providerLabel: string;
  sourcePriority: number;
  companyName: string;
  title: string;
  description: string;
  shortDescription: string;
  location: string;
  employmentType: string | null;
  remote: boolean;
  sourceUrl: string;
  applicationUrl: string | null;
  companyWebsite: string | null;
  pictureUrl: string | null;
  postedAt: Date | null;
  tags: string[];
  primaryRole: SoftwareRoleId;
  matchedRoles: SoftwareRoleId[];
};

export type ProviderResult = {
  provider: ProviderId;
  fetched: number;
  jobs: JobSeed[];
  errors: string[];
};

export type JobCard = {
  id: string;
  title: string;
  companyName: string;
  shortDescription: string;
  link: string;
  pictureUrl: string | null;
  location: string;
  employmentType: string | null;
  remote: boolean;
  providerLabel: string;
  primaryRole: SoftwareRoleId;
  matchedRoles: SoftwareRoleId[];
  tags: string[];
  postedAt: string | null;
  lastSeenAt: string;
};

export type StoredJobRecord = {
  id: string;
  canonicalKey: string;
  externalId: string;
  provider: ProviderId;
  providerKind: ProviderKind;
  providerLabel: string;
  companyName: string;
  title: string;
  description: string;
  shortDescription: string;
  link: string;
  sourceUrl: string;
  applicationUrl: string | null;
  companyWebsite: string | null;
  pictureUrl: string | null;
  location: string;
  employmentType: string | null;
  remote: boolean;
  primaryRole: SoftwareRoleId;
  matchedRoles: SoftwareRoleId[];
  tags: string[];
  rankingScore: number;
  priorityScore: number;
  postedAt: string | null;
  lastSeenAt: string;
  searchText: string;
  sourceSnapshots: SourceSnapshot[];
  createdAt: string;
  updatedAt: string;
};

export type ScrapeSummary = {
  durationMs: number;
  fetched: number;
  deduped: number;
  upserted: number;
  sources: Record<string, number>;
  errors: string[];
};
