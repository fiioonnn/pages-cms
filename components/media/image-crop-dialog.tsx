"use client";

import { useCallback, useState } from "react";
import Cropper from "react-easy-crop";
import type { Area } from "react-easy-crop";
import { getCroppedImage } from "@/lib/image-crop";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { Loader } from "lucide-react";

const ASPECT_OPTIONS = [
  { label: "Free", value: undefined },
  { label: "16:9", value: 16 / 9 },
  { label: "4:3", value: 4 / 3 },
  { label: "1:1", value: 1 },
  { label: "3:4", value: 3 / 4 },
] as const;

interface ImageCropDialogProps {
  file: File;
  open: boolean;
  onComplete: (result: File) => void;
  onSkip: () => void;
}

export function ImageCropDialog({
  file,
  open,
  onComplete,
  onSkip,
}: ImageCropDialogProps) {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [aspect, setAspect] = useState<number | undefined>(undefined);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [compress, setCompress] = useState(false);
  const [quality, setQuality] = useState(0.8);
  const [processing, setProcessing] = useState(false);
  const [originalSize] = useState(file.size);
  const [estimatedSize, setEstimatedSize] = useState<number | null>(null);

  // Load image on mount
  if (!imageSrc) {
    const reader = new FileReader();
    reader.onload = () => setImageSrc(reader.result as string);
    reader.readAsDataURL(file);
  }

  const onCropComplete = useCallback((_: Area, croppedPixels: Area) => {
    setCroppedAreaPixels(croppedPixels);
  }, []);

  const handleCompress = useCallback(async (blob: Blob, q: number): Promise<Blob> => {
    const imageCompression = (await import("browser-image-compression")).default;
    const compressedFile = await imageCompression(
      new File([blob], file.name, { type: blob.type || "image/jpeg" }),
      {
        initialQuality: q,
        useWebWorker: true,
        fileType: "image/jpeg",
      },
    );
    return compressedFile;
  }, [file.name]);

  const updateEstimate = useCallback(async () => {
    if (!compress || !imageSrc || !croppedAreaPixels) {
      setEstimatedSize(null);
      return;
    }
    try {
      const cropped = await getCroppedImage(imageSrc, croppedAreaPixels);
      const compressed = await handleCompress(cropped, quality);
      setEstimatedSize(compressed.size);
    } catch {
      setEstimatedSize(null);
    }
  }, [compress, imageSrc, croppedAreaPixels, quality, handleCompress]);

  const handleConfirm = useCallback(async () => {
    if (!imageSrc || !croppedAreaPixels) return;
    setProcessing(true);

    try {
      let blob = await getCroppedImage(imageSrc, croppedAreaPixels);

      if (compress) {
        blob = await handleCompress(blob, quality);
      }

      const resultFile = new File([blob], file.name, {
        type: blob.type || "image/jpeg",
      });
      onComplete(resultFile);
    } catch (error) {
      console.error("Crop/compress failed:", error);
      onSkip();
    } finally {
      setProcessing(false);
    }
  }, [imageSrc, croppedAreaPixels, compress, quality, file.name, onComplete, onSkip, handleCompress]);

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onSkip(); }}>
      <DialogContent className="sm:max-w-lg p-0 gap-0 overflow-hidden" showCloseButton={false}>
        <DialogHeader className="p-4 pb-0">
          <DialogTitle>Crop image</DialogTitle>
        </DialogHeader>

        <div className="relative h-[300px] bg-muted">
          {imageSrc && (
            <Cropper
              image={imageSrc}
              crop={crop}
              zoom={zoom}
              aspect={aspect}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={onCropComplete}
            />
          )}
        </div>

        <div className="p-4 space-y-4">
          <div>
            <p className="text-xs text-muted-foreground mb-2">Aspect ratio</p>
            <div className="flex gap-1.5">
              {ASPECT_OPTIONS.map((opt) => (
                <button
                  key={opt.label}
                  type="button"
                  onClick={() => setAspect(opt.value)}
                  className={cn(
                    "px-3 py-1.5 rounded-md text-xs border transition-colors",
                    aspect === opt.value
                      ? "bg-accent text-accent-foreground border-border"
                      : "border-transparent text-muted-foreground hover:text-foreground",
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground w-10">Zoom</span>
            <input
              type="range"
              min={1}
              max={3}
              step={0.1}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="flex-1 h-1 accent-primary"
            />
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <Label htmlFor="compress" className="text-sm">Compress image</Label>
              <p className="text-xs text-muted-foreground">Reduce file size before upload</p>
            </div>
            <Switch
              id="compress"
              checked={compress}
              onCheckedChange={(checked) => {
                setCompress(checked);
                if (!checked) setEstimatedSize(null);
              }}
            />
          </div>

          {compress && (
            <>
              <div className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground w-12">Quality</span>
                <input
                  type="range"
                  min={0.1}
                  max={1}
                  step={0.1}
                  value={quality}
                  onChange={(e) => {
                    setQuality(Number(e.target.value));
                    setEstimatedSize(null);
                  }}
                  onMouseUp={() => updateEstimate()}
                  onTouchEnd={() => updateEstimate()}
                  className="flex-1 h-1 accent-primary"
                />
                <span className="text-xs text-muted-foreground w-8 text-right">
                  {Math.round(quality * 100)}%
                </span>
              </div>

              <div className="flex items-center gap-4 justify-center text-xs">
                <span className="text-muted-foreground">
                  Original: <span className="text-foreground font-medium">{formatSize(originalSize)}</span>
                </span>
                {estimatedSize !== null && (
                  <>
                    <span className="text-muted-foreground">
                      Compressed: <span className="text-foreground font-medium">{formatSize(estimatedSize)}</span>
                    </span>
                    <span className="text-green-500 font-medium">
                      -{Math.round((1 - estimatedSize / originalSize) * 100)}%
                    </span>
                  </>
                )}
              </div>
            </>
          )}
        </div>

        <DialogFooter className="p-4 pt-0">
          <Button variant="outline" onClick={onSkip} disabled={processing}>
            Skip
          </Button>
          <Button onClick={handleConfirm} disabled={processing || !imageSrc}>
            {processing && <Loader className="h-4 w-4 animate-spin mr-2" />}
            Crop & Upload
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
