import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * S3 error code to user-friendly message mapping
 */
const S3_ERROR_MESSAGES: Record<string, string> = {
  BucketNotEmpty: "The bucket is not empty. Enable 'Force delete' to remove all objects first.",
  BucketAlreadyExists: "A bucket with this name already exists.",
  BucketAlreadyOwnedByYou: "You already own a bucket with this name.",
  NoSuchBucket: "The specified bucket does not exist.",
  NoSuchKey: "The specified object does not exist.",
  AccessDenied: "Access denied. Check your credentials and permissions.",
  InvalidAccessKeyId: "The access key ID is invalid.",
  SignatureDoesNotMatch: "The secret access key is incorrect.",
  InvalidBucketName:
    "The bucket name is invalid. Use only lowercase letters, numbers, hyphens, and periods (3-63 characters).",
  TooManyBuckets: "You have reached the maximum number of buckets allowed.",
  OperationAborted: "The operation was aborted. Please try again.",
  SlowDown: "Too many requests. Please wait a moment and try again.",
  ServiceUnavailable: "The service is temporarily unavailable. Please try again later.",
  InternalError: "An internal error occurred. Please try again.",
  RequestTimeout: "The request timed out. Please try again.",
  InvalidRequest: "The request is invalid.",
  MalformedXML: "The request contains malformed XML.",
  InvalidLocationConstraint: "The specified location constraint is not valid.",
  IllegalLocationConstraintException: "The specified region is not valid for this operation.",
};

/**
 * Parse an S3 error and return a user-friendly message
 */
export function parseS3Error(error: unknown): string {
  const errorStr = String(error);

  // Try to extract S3 error code from the error string
  // Pattern: code: Some("ErrorCode")
  const codeMatch = errorStr.match(/code:\s*Some\("([^"]+)"\)/);
  if (codeMatch) {
    const errorCode = codeMatch[1];
    if (errorCode in S3_ERROR_MESSAGES) {
      return S3_ERROR_MESSAGES[errorCode];
    }
    // Return the error code in a readable format if not in our mapping
    return `${errorCode.replace(/([A-Z])/g, " $1").trim()}.`;
  }

  // Try to extract message from the error string
  // Pattern: message: Some("...")
  const messageMatch = errorStr.match(/message:\s*Some\("([^"]+)"\)/);
  if (messageMatch) {
    const message = messageMatch[1];
    // Truncate if too long
    if (message.length > 100) {
      return message.substring(0, 100) + "...";
    }
    return message;
  }

  // If error string is too long, truncate it
  if (errorStr.length > 100) {
    return errorStr.substring(0, 100) + "...";
  }

  return errorStr;
}
