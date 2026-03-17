import fs from "node:fs/promises";
import path from "node:path";

import { LocalIndex, type IndexItem, type MetadataFilter } from "vectra";

import { ALL_ROLE_VALUE, SOFTWARE_ROLES, type RoleFilterValue, type SoftwareRoleId } from "@/lib/jobs/roles";
import type { StoredJobRecord } from "@/lib/jobs/types";

const VECTOR_DIMENSIONS = 192;
const INDEX_PATH = path.join(process.cwd(), ".vectra", "jobs-store-v1");

type VectorJobMetadata = {
  canonicalKey: string;
  companyName: string;
  lastSeenAt: number;
  location: string;
  payload: string;
  primaryRole: string;
  remote: boolean;
  searchText: string;
  title: string;
  updatedAt: number;
} & Record<string, string | number | boolean>;

type RelatedJobMatch = {
  job: StoredJobRecord;
  score: number;
};

const ROLE_METADATA_KEYS = Object.fromEntries(
  SOFTWARE_ROLES.map((role) => [role.id, `role__${role.id.replace(/-/g, "_")}`]),
) as Record<SoftwareRoleId, string>;

let cachedIndex: LocalIndex<VectorJobMetadata> | null = null;

function normalizeValue(value: string) {
  return value.trim().toLowerCase();
}

function tokenizeValue(value: string) {
  return normalizeValue(value)
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 1);
}

function hashToken(token: string) {
  let hash = 0;

  for (let index = 0; index < token.length; index += 1) {
    hash = (hash * 31 + token.charCodeAt(index)) >>> 0;
  }

  return hash;
}

function normalizeVector(vector: number[]) {
  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));

  if (!magnitude) {
    return vector;
  }

  return vector.map((value) => value / magnitude);
}

export function embedText(value: string) {
  const vector = new Array<number>(VECTOR_DIMENSIONS).fill(0);
  const tokens = tokenizeValue(value);

  if (tokens.length === 0) {
    return vector;
  }

  for (const token of tokens) {
    const hash = hashToken(token);
    const primaryIndex = hash % VECTOR_DIMENSIONS;
    const secondaryIndex = (hash >>> 8) % VECTOR_DIMENSIONS;

    vector[primaryIndex] += 1.2;
    vector[secondaryIndex] += 0.55;
  }

  return normalizeVector(vector);
}

function buildRoleMetadata(matchedRoles: SoftwareRoleId[]) {
  return Object.fromEntries(
    SOFTWARE_ROLES.map((role) => [ROLE_METADATA_KEYS[role.id], matchedRoles.includes(role.id)]),
  );
}

function createSearchText(job: StoredJobRecord) {
  return [
    job.title,
    job.companyName,
    job.description,
    job.shortDescription,
    job.location,
    job.tags.join(" "),
    job.matchedRoles.join(" "),
    job.providerLabel,
  ]
    .filter(Boolean)
    .join(" ");
}

function toVectorMetadata(job: StoredJobRecord): VectorJobMetadata {
  return {
    canonicalKey: job.canonicalKey,
    title: job.title,
    companyName: job.companyName,
    location: job.location,
    primaryRole: job.primaryRole,
    remote: job.remote,
    searchText: createSearchText(job),
    lastSeenAt: new Date(job.lastSeenAt).getTime(),
    updatedAt: new Date(job.updatedAt).getTime(),
    payload: JSON.stringify(job),
    ...buildRoleMetadata(job.matchedRoles),
  };
}

function fromVectorMetadata(metadata: VectorJobMetadata) {
  if (!metadata.payload) {
    throw new Error("Vector index item is missing its payload.");
  }

  return JSON.parse(metadata.payload) as StoredJobRecord;
}

async function hydrateItemMetadata(item: IndexItem<VectorJobMetadata>) {
  if (!item.metadataFile || item.metadata.payload) {
    return item.metadata;
  }

  const metadataPath = path.join(INDEX_PATH, item.metadataFile);
  const payload = JSON.parse(await fs.readFile(metadataPath, "utf8")) as VectorJobMetadata;
  return payload;
}

async function ensureIndex() {
  if (!cachedIndex) {
    cachedIndex = new LocalIndex<VectorJobMetadata>(INDEX_PATH);
  }

  if (!(await cachedIndex.isIndexCreated())) {
    await cachedIndex.createIndex({
      version: 1,
      metadata_config: {
        indexed: [
          "canonicalKey",
          "primaryRole",
          "remote",
          "updatedAt",
          "lastSeenAt",
          ...Object.values(ROLE_METADATA_KEYS),
        ],
      },
    });
  }

  return cachedIndex;
}

function buildRoleFilter(role: RoleFilterValue): MetadataFilter | undefined {
  if (role === ALL_ROLE_VALUE) {
    return undefined;
  }

  return {
    [ROLE_METADATA_KEYS[role]]: {
      $eq: true,
    },
  };
}

function locationMatches(job: StoredJobRecord, location: string) {
  if (!location) {
    return true;
  }

  const normalizedLocation = normalizeValue(location);
  const jobLocation = normalizeValue(job.location);

  if (/remote/.test(normalizedLocation) && job.remote) {
    return true;
  }

  return jobLocation.includes(normalizedLocation);
}

export async function listStoredJobs() {
  const index = await ensureIndex();
  const items = await index.listItems<VectorJobMetadata>();

  const hydratedItems = await Promise.all(
    items.map(async (item) => hydrateItemMetadata(item)),
  );

  return hydratedItems.flatMap((metadata) => {
    try {
      return [fromVectorMetadata(metadata)];
    } catch {
      return [];
    }
  });
}

export async function getStoredJob(canonicalKey: string) {
  const index = await ensureIndex();
  const item = await index.getItem<VectorJobMetadata>(canonicalKey);

  if (!item) {
    return null;
  }

  return fromVectorMetadata(await hydrateItemMetadata(item));
}

export async function upsertStoredJobs(records: StoredJobRecord[]) {
  if (records.length === 0) {
    return;
  }

  const index = await ensureIndex();
  await index.beginUpdate();

  try {
    for (const job of records) {
      const metadata = toVectorMetadata(job);

      await index.upsertItem({
        id: job.canonicalKey,
        vector: embedText(metadata.searchText),
        metadata,
      });
    }

    await index.endUpdate();
  } catch (error) {
    index.cancelUpdate();
    throw error;
  }
}

export async function queryRelatedJobs(options: {
  query: string;
  role?: RoleFilterValue;
  location?: string;
  limit?: number;
}) {
  const searchQuery = [options.query, options.role && options.role !== ALL_ROLE_VALUE
    ? SOFTWARE_ROLES.find((role) => role.id === options.role)?.label ?? ""
    : "", options.location ?? ""]
    .filter(Boolean)
    .join(" ");

  if (!searchQuery.trim()) {
    return [] as RelatedJobMatch[];
  }

  const index = await ensureIndex();
  const results = await index.queryItems<VectorJobMetadata>(
    embedText(searchQuery),
    searchQuery,
    Math.max(options.limit ?? 12, 12),
    buildRoleFilter(options.role ?? ALL_ROLE_VALUE),
  );

  return results
    .map((result) => ({
      job: fromVectorMetadata(result.item.metadata),
      score: result.score,
    }))
    .filter((entry) => locationMatches(entry.job, options.location ?? ""));
}

export async function getVectorIndexStats() {
  const index = await ensureIndex();
  return index.getIndexStats();
}
