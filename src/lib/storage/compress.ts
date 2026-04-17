/**
 * Client-side image compression shared across capture surfaces.
 *
 * Phone cameras produce 5-15MB images. We don't need originals for OCR
 * or display — 1500px wide at JPEG 0.8 keeps text readable and cuts
 * upload payload by ~10x.
 */
export function compressImage(
  file: File,
  maxWidth = 1500,
  quality = 0.8
): Promise<File> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);

      let { width, height } = img;
      if (width > maxWidth) {
        height = Math.round((height * maxWidth) / width);
        width = maxWidth;
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("Canvas not supported"));

      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          if (!blob) return reject(new Error("Compression failed"));
          resolve(
            new File([blob], file.name.replace(/\.\w+$/, ".jpg"), {
              type: "image/jpeg",
            })
          );
        },
        "image/jpeg",
        quality
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to load image"));
    };
    img.src = url;
  });
}

export const IMAGE_MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export const IMAGE_ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
]);
