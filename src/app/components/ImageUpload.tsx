"use client";

import { useRef, useState } from "react";

export interface ImageFile {
  base64: string;
  mimeType: string;
  name: string;
}

interface Props {
  images: ImageFile[];
  onChange: (images: ImageFile[]) => void;
  /** File paths from a loaded historic revision — shown as read-only thumbnails. */
  historicPaths?: string[];
  disabled?: boolean;
}

const MAX_IMAGES = 10;
const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
const ACCEPTED_MIME = new Set(["image/png", "image/jpeg", "image/webp"]);

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      // result is "data:<mime>;base64,<data>" — strip the prefix
      const result = reader.result as string;
      resolve(result.split(",")[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function ImageUpload({ images, onChange, historicPaths, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function processFiles(fileList: FileList | File[]) {
    setError(null);
    const files = Array.from(fileList);
    const remaining = MAX_IMAGES - images.length;

    if (remaining <= 0) {
      setError(`Maximum ${MAX_IMAGES} images allowed.`);
      return;
    }

    const toProcess = files.slice(0, remaining);

    const invalidType = toProcess.filter((f) => !ACCEPTED_MIME.has(f.type));
    if (invalidType.length > 0) {
      setError("Only PNG, JPG, and WebP images are accepted.");
      return;
    }

    const oversized = toProcess.filter((f) => f.size > MAX_SIZE_BYTES);
    if (oversized.length > 0) {
      setError(
        `${oversized.map((f) => f.name).join(", ")} exceed${oversized.length === 1 ? "s" : ""} the 5 MB limit.`
      );
      return;
    }

    const newImages = await Promise.all(
      toProcess.map(async (file): Promise<ImageFile> => ({
        base64: await fileToBase64(file),
        mimeType: file.type,
        name: file.name,
      }))
    );

    onChange([...images, ...newImages]);
  }

  function removeImage(index: number) {
    onChange(images.filter((_, i) => i !== index));
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    if (disabled) return;
    processFiles(e.dataTransfer.files);
  }

  const canAddMore = !disabled && images.length < MAX_IMAGES;
  const hasAny = images.length > 0 || (historicPaths && historicPaths.length > 0);

  return (
    <div>
      {/* Thumbnail row */}
      {hasAny && (
        <div className="mb-3 flex flex-wrap gap-3">
          {images.map((img, i) => (
            <div key={i} className="relative flex-shrink-0">
              <img
                src={`data:${img.mimeType};base64,${img.base64}`}
                alt={img.name}
                className="h-20 w-20 rounded border border-gray-200 object-cover"
              />
              {!disabled && (
                <button
                  type="button"
                  onClick={() => removeImage(i)}
                  className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-gray-600 text-white text-xs leading-none hover:bg-red-600 focus:outline-none"
                  aria-label={`Remove ${img.name}`}
                >
                  ×
                </button>
              )}
              <p className="mt-0.5 w-20 truncate text-center text-xs text-gray-400" title={img.name}>
                {img.name}
              </p>
            </div>
          ))}

          {/* Historic read-only thumbnails */}
          {historicPaths?.map((filePath, i) => (
            <div key={`hist-${i}`} className="relative flex-shrink-0">
              <img
                src={`/api/upload?path=${encodeURIComponent(filePath)}`}
                alt={filePath}
                className="h-20 w-20 rounded border border-gray-200 object-cover"
              />
              <p
                className="mt-0.5 w-20 truncate text-center text-xs text-gray-400"
                title={filePath}
              >
                {filePath.split("/").pop()}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Drop zone — hidden when disabled or at limit */}
      {canAddMore && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          className={`flex cursor-pointer flex-col items-center justify-center rounded-md border-2 border-dashed px-4 py-5 text-sm transition-colors ${
            dragOver
              ? "border-blue-400 bg-blue-50"
              : "border-gray-300 bg-white hover:border-blue-300 hover:bg-gray-50"
          }`}
        >
          <span className="text-gray-500">
            Drag &amp; drop or{" "}
            <span className="font-medium text-blue-500">click to select</span>
          </span>
          <span className="mt-1 text-xs text-gray-400">
            PNG, JPG, WebP · max 5 MB each · {images.length}/{MAX_IMAGES} added
          </span>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept=".png,.jpg,.jpeg,.webp"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files) {
            processFiles(e.target.files);
            // Reset so the same file can be re-selected
            e.target.value = "";
          }
        }}
      />

      {error && <p className="mt-1.5 text-xs text-red-500">{error}</p>}
    </div>
  );
}
