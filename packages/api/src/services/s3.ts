import {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "../env.js";

const PRESIGNED_URL_EXPIRY_SECONDS = 300; // 5 minutes

/** Upper bound on objects a single listing walks, whatever the page size. */
export const MAX_LISTED_OBJECTS = 5000;

let s3Client: S3Client | null = null;

function getS3Client(): S3Client {
  if (!s3Client) {
    s3Client = new S3Client({
      region: env.AWS_REGION,
      credentials: {
        accessKeyId: env.AWS_ACCESS_KEY_ID,
        secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
      },
    });
  }
  return s3Client;
}

/**
 * Generate a pre-signed PUT URL for uploading an image to S3.
 * Returns the signed URL and the S3 object key.
 */
export async function generatePresignedUploadUrl(
  key: string,
  contentType: string,
): Promise<{ upload_url: string; key: string }> {
  const command = new PutObjectCommand({
    Bucket: env.AWS_S3_BUCKET,
    Key: key,
    ContentType: contentType,
  });

  const upload_url = await getSignedUrl(getS3Client(), command, {
    expiresIn: PRESIGNED_URL_EXPIRY_SECONDS,
  });

  return { upload_url, key };
}

export interface S3ObjectInfo {
  key: string;
  size: number;
  last_modified: Date | null;
}

/**
 * Metadata for one object, or null when it does not exist.
 *
 * S3 answers a missing key with 404 only when the caller holds s3:ListBucket;
 * without it the same miss is a 403, which is indistinguishable from a real
 * permission problem and is rethrown like any other failure.
 */
export async function headObject(key: string): Promise<Omit<S3ObjectInfo, "key"> | null> {
  try {
    const res = await getS3Client().send(
      new HeadObjectCommand({ Bucket: env.AWS_S3_BUCKET, Key: key }),
    );
    return { size: res.ContentLength ?? 0, last_modified: res.LastModified ?? null };
  } catch (err) {
    const e = err as { name?: string; $metadata?: { httpStatusCode?: number } };
    if (e?.name === "NotFound" || e?.name === "NoSuchKey" || e?.$metadata?.httpStatusCode === 404) {
      return null;
    }
    throw err;
  }
}

/**
 * Every object under a prefix, following continuation tokens until the end or
 * `cap` objects (needs s3:ListBucket). `truncated` says the cap cut it short.
 */
export async function listObjects(
  prefix: string,
  cap: number = MAX_LISTED_OBJECTS,
): Promise<{ objects: S3ObjectInfo[]; truncated: boolean }> {
  const objects: S3ObjectInfo[] = [];
  let token: string | undefined;

  do {
    const res = await getS3Client().send(
      new ListObjectsV2Command({
        Bucket: env.AWS_S3_BUCKET,
        Prefix: prefix,
        ContinuationToken: token,
        MaxKeys: Math.min(1000, cap - objects.length),
      }),
    );

    for (const obj of res.Contents ?? []) {
      if (!obj.Key) continue;
      if (objects.length >= cap) {
        return { objects, truncated: true };
      }
      objects.push({
        key: obj.Key,
        size: obj.Size ?? 0,
        last_modified: obj.LastModified ?? null,
      });
    }

    token = res.IsTruncated ? res.NextContinuationToken : undefined;
    if (token && objects.length >= cap) {
      return { objects, truncated: true };
    }
  } while (token);

  return { objects, truncated: false };
}
