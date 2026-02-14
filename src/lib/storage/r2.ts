import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID!;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME!;

const r2Client = new S3Client({
  region: "auto",
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

interface UploadAudioParams {
  userId: string;
  buffer: Buffer;
  contentType: string;
  fileExtension: string;
}

export async function uploadAudio(params: UploadAudioParams): Promise<string> {
  const key = `voice-dumps/${params.userId}/${Date.now()}.${params.fileExtension}`;

  await r2Client.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
      Body: params.buffer,
      ContentType: params.contentType,
    })
  );

  return `r2://${R2_BUCKET_NAME}/${key}`;
}
