import mongoose, { Document, Schema, Model } from "mongoose";

export interface IEmailVerification extends Document {
  email: string;
  code: string;
  expiresAt: Date;
  isUsed: boolean;
  createdAt: Date;
}

export interface IEmailVerificationModel extends Model<IEmailVerification> {
  generateCode(): string;
  createVerification(email: string): Promise<IEmailVerification>;
  verifyCode(email: string, code: string): Promise<boolean>;
}

const EmailVerificationSchema = new Schema<IEmailVerification>(
  {
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    code: {
      type: String,
      required: true,
      length: 6,
    },
    expiresAt: {
      type: Date,
      required: true,
      default: () => new Date(Date.now() + 15 * 60 * 1000), // 15 minutes
    },
    isUsed: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// Static method to generate verification code
EmailVerificationSchema.statics.generateCode = function (): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Static method to create verification
EmailVerificationSchema.statics.createVerification = async function (
  email: string
): Promise<IEmailVerification> {
  // Remove any existing verification for this email
  await this.deleteMany({ email });

  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const verification = new this({
    email,
    code,
    expiresAt: new Date(Date.now() + 15 * 60 * 1000), // 15 minutes
  });

  return verification.save();
};

// Static method to verify code
EmailVerificationSchema.statics.verifyCode = async function (
  email: string,
  code: string
): Promise<boolean> {
  const verification = await this.findOne({
    email: email.toLowerCase(),
    code,
    isUsed: false,
    expiresAt: { $gt: new Date() },
  });

  if (verification) {
    verification.isUsed = true;
    await verification.save();
    return true;
  }

  return false;
};

// Index for cleanup
EmailVerificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model<IEmailVerification, IEmailVerificationModel>(
  "EmailVerification",
  EmailVerificationSchema
);
