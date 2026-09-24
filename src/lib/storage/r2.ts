import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

let client: { s3: S3Client; bucket: string } | null = null;

/**
 * The R2 client, built on first upload.
 *
 * It used to be built at module scope from non-null-asserted env vars, so a
 * missing R2_ACCOUNT_ID didn't fail anything: it produced a request to
 * "https://undefined.r2.cloudflarestorage.com" and a confusing DNS error at
 * upload time. Now a missing variable is named in the error.
 */
function getR2(): { s3: S3Client; bucket: string } {
  if (client) return client;

  const env = {
    R2_ACCOUNT_ID: process.env.R2_ACCOUNT_ID,
    R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID,
    R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY,
    R2_BUCKET_NAME: process.env.R2_BUCKET_NAME,
  };
  const missing = Object.entries(env)
    .filter(([, v]) => !v)
    .map(([k]) => k);
  if (missing.length > 0) {
    throw new Error(`R2 storage is not configured: missing ${missing.join(", ")}`);
  }

  client = {
    s3: new S3Client({
      region: "auto",
      endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: env.R2_ACCESS_KEY_ID!,
        secretAccessKey: env.R2_SECRET_ACCESS_KEY!,
      },
    }),
    bucket: env.R2_BUCKET_NAME!,
  };
  return client;
}

interface UploadAudioParams {
  userId: string;
  buffer: Buffer;
  contentType: string;
  fileExtension: string;
}

export async function uploadAudio(params: UploadAudioParams): Promise<string> {
  const key = `voice-dumps/${params.userId}/${Date.now()}.${params.fileExtension}`;

  const { s3, bucket } = getR2();
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: params.buffer,
      ContentType: params.contentType,
    })
  );

  return `r2://${bucket}/${key}`;
}

interface UploadPhotoParams {
  userId: string;
  buffer: Buffer;
  contentType: string;
  fileExtension: string;
}

export async function uploadPhoto(params: UploadPhotoParams): Promise<string> {
  const key = `photo-dumps/${params.userId}/${Date.now()}.${params.fileExtension}`;

  const { s3, bucket } = getR2();
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: params.buffer,
      ContentType: params.contentType,
    })
  );

  return `r2://${bucket}/${key}`;
}
