import mongoose, { Document, Schema } from "mongoose";
import bcrypt from "bcryptjs";

export interface IUser extends Document {
  firstName: string;
  lastName: string;
  email: string;
  password?: string;
  googleId?: string;
  isEmailVerified: boolean;
  avatar?: string;
  subscription: {
    plan: "free" | "pro" | "pro+" | "enterprise";
    status: "active" | "inactive" | "cancelled";
    startDate: Date;
    endDate?: Date;
    tokens: number;
    minutesLeft: number;
    stripeCustomerId?: string;
    stripeSubscriptionId?: string;
    stripePriceId?: string;
  };
  usage: {
    interviewsCompleted: number;
    totalMinutesUsed: number;
    lastInterviewDate?: Date;
  };
  preferences: {
    language: string;
    interviewTypes: string[];
    notifications: {
      email: boolean;
      push: boolean;
    };
  };
  createdAt: Date;
  updatedAt: Date;
  comparePassword(candidatePassword: string): Promise<boolean>;
}

const UserSchema = new Schema<IUser>(
  {
    firstName: {
      type: String,
      required: [true, "First name is required"],
      trim: true,
      maxlength: [50, "First name cannot exceed 50 characters"],
    },
    lastName: {
      type: String,
      required: [true, "Last name is required"],
      trim: true,
      maxlength: [50, "Last name cannot exceed 50 characters"],
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
      match: [
        /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
        "Please enter a valid email",
      ],
    },
    password: {
      type: String,
      minlength: [6, "Password must be at least 6 characters"],
      select: false,
    },
    googleId: {
      type: String,
      unique: true,
      sparse: true,
    },
    isEmailVerified: {
      type: Boolean,
      default: false,
    },
    avatar: {
      type: String,
      default: "",
    },
    subscription: {
      plan: {
        type: String,
        enum: ["free", "pro", "pro+", "enterprise"],
        default: "free",
      },
      status: {
        type: String,
        enum: ["active", "inactive", "cancelled"],
        default: "active",
      },
      startDate: {
        type: Date,
        default: Date.now,
      },
      endDate: Date,
      tokens: {
        type: Number,
        default: function () {
          return (this as any).subscription?.plan === "free"
            ? 10
            : (this as any).subscription?.plan === "pro"
            ? 100
            : (this as any).subscription?.plan === "pro+"
            ? 1000
            : 1000;
        },
      },
      minutesLeft: {
        type: Number,
        default: function () {
          // Minutes allocations: free=5, pro=90, pro+=unlimited (-1)
          return (this as any).subscription?.plan === "free"
            ? 5
            : (this as any).subscription?.plan === "pro"
            ? 90
            : (this as any).subscription?.plan === "pro+"
            ? -1
            : 0;
        },
      },
      stripeCustomerId: {
        type: String,
        default: null,
      },
      stripeSubscriptionId: {
        type: String,
        default: null,
      },
      stripePriceId: {
        type: String,
        default: null,
      },
    },
    usage: {
      interviewsCompleted: {
        type: Number,
        default: 0,
      },
      totalMinutesUsed: {
        type: Number,
        default: 0,
      },
      lastInterviewDate: Date,
    },
    preferences: {
      language: {
        type: String,
        default: "en",
      },
      interviewTypes: [
        {
          type: String,
          enum: ["technical", "behavioral", "general"],
        },
      ],
      notifications: {
        email: {
          type: Boolean,
          default: true,
        },
        push: {
          type: Boolean,
          default: true,
        },
      },
    },
  },
  {
    timestamps: true,
  }
);

// Hash password before saving
UserSchema.pre("save", async function (next) {
  if (!this.isModified("password") || !this.password) return next();

  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error: any) {
    next(error);
  }
});

// Compare password method
UserSchema.methods.comparePassword = async function (
  candidatePassword: string
): Promise<boolean> {
  if (!this.password) return false;
  return bcrypt.compare(candidatePassword, this.password);
};

// Transform output
UserSchema.set("toJSON", {
  transform: function (doc, ret: any) {
    delete ret.password;
    delete ret.__v;
    return ret;
  },
});

export default mongoose.model<IUser>("User", UserSchema);
