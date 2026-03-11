import { Schema, model, type Document } from "mongoose";

export interface ICacheEntry extends Document {
  calendario_id: number;
  fetched_at: Date;
  expires_at: Date;
  total_clases: number;
  is_refreshing: boolean;
}

const CacheEntrySchema = new Schema<ICacheEntry>(
  {
    calendario_id: { type: Number, required: true, unique: true },
    fetched_at: { type: Date, required: true },
    expires_at: { type: Date, required: true },
    total_clases: { type: Number, required: true, default: 0 },
    is_refreshing: { type: Boolean, required: true, default: false },
  },
  {
    versionKey: false,
    collection: "cache_entries",
  }
);

CacheEntrySchema.index({ calendario_id: 1 }, { unique: true });
CacheEntrySchema.index({ expires_at: 1 });

export const CacheEntryModel = model<ICacheEntry>("CacheEntry", CacheEntrySchema);
