import mongoose, { Document, Schema } from "mongoose";

export interface ISubscriptionCode extends Document {
  code: string;
  planType: "pro" | "pro+";
  isUsed: boolean;
  usedBy?: mongoose.Types.ObjectId;
  usedAt?: Date;
  expiresAt: Date;
  createdAt: Date;
  generatedBy: string; // Admin identifier
}

const SubscriptionCodeSchema = new Schema<ISubscriptionCode>({
  code: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  planType: {
    type: String,
    enum: ["pro", "pro+"],
    required: true,
  },
  isUsed: {
    type: Boolean,
    default: false,
  },
  usedBy: {
    type: Schema.Types.ObjectId,
    ref: "User",
    default: null,
  },
  usedAt: {
    type: Date,
    default: null,
  },
  expiresAt: {
    type: Date,
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  generatedBy: {
    type: String,
    required: true,
  },
});

// Index for efficient queries
SubscriptionCodeSchema.index({ code: 1, isUsed: 1 });
SubscriptionCodeSchema.index({ expiresAt: 1 });

export default mongoose.model<ISubscriptionCode>(
  "SubscriptionCode",
  SubscriptionCodeSchema
);


