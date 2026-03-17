import {
  model,
  models,
  Schema,
  type HydratedDocument,
  type InferSchemaType,
} from "mongoose";

const sourceSnapshotSchema = new Schema(
  {
    provider: { type: String, required: true },
    providerKind: { type: String, required: true },
    providerLabel: { type: String, required: true },
    externalId: { type: String, required: true },
    sourceUrl: { type: String, required: true },
    applicationUrl: { type: String, default: null },
    priority: { type: Number, required: true },
    capturedAt: { type: Date, required: true },
  },
  {
    _id: false,
  },
);

const jobSchema = new Schema(
  {
    canonicalKey: { type: String, required: true, unique: true, index: true },
    externalId: { type: String, required: true },
    provider: { type: String, required: true, index: true },
    providerKind: { type: String, required: true },
    providerLabel: { type: String, required: true },
    companyName: { type: String, required: true, index: true },
    title: { type: String, required: true, index: true },
    description: { type: String, required: true },
    shortDescription: { type: String, required: true },
    link: { type: String, required: true },
    sourceUrl: { type: String, required: true },
    applicationUrl: { type: String, default: null },
    companyWebsite: { type: String, default: null },
    pictureUrl: { type: String, default: null },
    location: { type: String, required: true },
    employmentType: { type: String, default: null },
    remote: { type: Boolean, default: false },
    primaryRole: { type: String, required: true, index: true },
    matchedRoles: [{ type: String, required: true }],
    tags: [{ type: String }],
    rankingScore: { type: Number, required: true, index: true },
    priorityScore: { type: Number, required: true, index: true },
    postedAt: { type: Date, default: null },
    lastSeenAt: { type: Date, required: true, index: true },
    searchText: { type: String, required: true },
    sourceSnapshots: {
      type: [sourceSnapshotSchema],
      default: [],
    },
  },
  {
    collection: "jobs",
    timestamps: true,
    versionKey: false,
  },
);

jobSchema.index({ primaryRole: 1, rankingScore: -1, updatedAt: -1 });
jobSchema.index({ matchedRoles: 1, rankingScore: -1 });
jobSchema.index({ lastSeenAt: -1 });
jobSchema.index({ searchText: "text", title: "text", companyName: "text" });

export type JobRecord = InferSchemaType<typeof jobSchema>;
export type JobDocument = HydratedDocument<JobRecord>;

export const JobModel = models.Job || model("Job", jobSchema);
