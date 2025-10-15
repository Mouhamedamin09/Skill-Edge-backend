import crypto from "crypto";

export interface CodeGenerationOptions {
  planType: "pro" | "pro+";
  adminId: string;
  customPrefix?: string;
}

export interface GeneratedCode {
  code: string;
  planType: "pro" | "pro+";
  expiresAt: Date;
  generatedBy: string;
}

/**
 * Generate a unique subscription code for a specific plan type
 * Each plan type has its own algorithm and format
 */
export class SubscriptionCodeGenerator {
  private static readonly PRO_PREFIX = "SKP";
  private static readonly PRO_PLUS_PREFIX = "SKPP";
  private static readonly CODE_LENGTH = 8;
  private static readonly VALIDITY_DAYS = 30;

  /**
   * Generate a code for Pro plan
   * Format: SKP-XXXX-XXXX (where X is alphanumeric)
   */
  private static generateProCode(): string {
    const randomPart = this.generateRandomString(this.CODE_LENGTH);
    return `${this.PRO_PREFIX}-${randomPart.substring(
      0,
      4
    )}-${randomPart.substring(4, 8)}`;
  }

  /**
   * Generate a code for Pro+ plan
   * Format: SKPP-XXXX-XXXX (where X is alphanumeric)
   */
  private static generateProPlusCode(): string {
    const randomPart = this.generateRandomString(this.CODE_LENGTH);
    return `${this.PRO_PLUS_PREFIX}-${randomPart.substring(
      0,
      4
    )}-${randomPart.substring(4, 8)}`;
  }

  /**
   * Generate random alphanumeric string
   */
  private static generateRandomString(length: number): string {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let result = "";

    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    return result;
  }

  /**
   * Generate a unique subscription code
   */
  public static generateCode(options: CodeGenerationOptions): GeneratedCode {
    const { planType, adminId, customPrefix } = options;

    let code: string;

    if (customPrefix) {
      // Custom prefix for special cases
      const randomPart = this.generateRandomString(this.CODE_LENGTH);
      code = `${customPrefix}-${randomPart.substring(
        0,
        4
      )}-${randomPart.substring(4, 8)}`;
    } else {
      // Standard generation based on plan type
      code =
        planType === "pro"
          ? this.generateProCode()
          : this.generateProPlusCode();
    }

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + this.VALIDITY_DAYS);

    return {
      code,
      planType,
      expiresAt,
      generatedBy: adminId,
    };
  }

  /**
   * Validate code format without checking database
   */
  public static validateCodeFormat(code: string): {
    isValid: boolean;
    planType?: "pro" | "pro+";
    error?: string;
  } {
    if (!code || typeof code !== "string") {
      return { isValid: false, error: "Code is required" };
    }

    const trimmedCode = code.trim().toUpperCase();

    // Check Pro format: SKP-XXXX-XXXX
    if (trimmedCode.startsWith(this.PRO_PREFIX + "-")) {
      const pattern = /^SKP-[A-Z0-9]{4}-[A-Z0-9]{4}$/;
      if (pattern.test(trimmedCode)) {
        return { isValid: true, planType: "pro" };
      }
    }

    // Check Pro+ format: SKPP-XXXX-XXXX
    if (trimmedCode.startsWith(this.PRO_PLUS_PREFIX + "-")) {
      const pattern = /^SKPP-[A-Z0-9]{4}-[A-Z0-9]{4}$/;
      if (pattern.test(trimmedCode)) {
        return { isValid: true, planType: "pro+" };
      }
    }

    return {
      isValid: false,
      error:
        "Invalid code format. Expected format: SKP-XXXX-XXXX or SKPP-XXXX-XXXX",
    };
  }

  /**
   * Generate multiple codes at once
   */
  public static generateMultipleCodes(
    planType: "pro" | "pro+",
    adminId: string,
    count: number
  ): GeneratedCode[] {
    const codes: GeneratedCode[] = [];

    for (let i = 0; i < count; i++) {
      codes.push(this.generateCode({ planType, adminId }));
    }

    return codes;
  }

  /**
   * Get plan type from code without validation
   */
  public static getPlanTypeFromCode(code: string): "pro" | "pro+" | null {
    const trimmedCode = code.trim().toUpperCase();

    if (trimmedCode.startsWith(this.PRO_PREFIX + "-")) {
      return "pro";
    }

    if (trimmedCode.startsWith(this.PRO_PLUS_PREFIX + "-")) {
      return "pro+";
    }

    return null;
  }
}


