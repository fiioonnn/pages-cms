"use client";

import { useCallback, useState } from "react";
import Cropper from "react-easy-crop";
import type { Area } from "react-easy-crop";
import { getCroppedImage } from "@/lib/image-crop";
import { useConfig } from "@/contexts/config-context";
import { requireApiSuccess } from "@/lib/api-client";
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
import { toast } from "sonner";
import { Crop, Loader, X, Download } from "lucide-react";
import type { MediaItem, FileSaveData } from "@/types/api";

interface ImagePreviewDialogProps {
  item: MediaItem;
  mediaName: string;
  imageUrl: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onReplace?: (entry: FileSaveData) => void;
}

const ASPECT_OPTIONS = [
  { label: "Free", value: undefined },
  { label: "16:9", value: 16 / 9 },
  { label: "4:3", value: 4 / 3 },
  { label: "1:1", value: 1 },
  { label: "3:4", value: 3 / 4 },
] as const;

export function ImagePreviewDialog({
  item,
  mediaName,
  imageUrl,
  open,
  onOpenChange,
  onReplace,
}: ImagePreviewDialogProps) {
  const { config } = useConfig();
  const [editing, setEditing] = useState(false);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [aspect, setAspect] = useState<number | undefined>(undefined);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [compress, setCompress] = useState(false);
  const [quality, setQuality] = useState(0.8);
  const [processing, setProcessing] = useState(false);

  const onCropComplete = useCallback((_: Area, croppedPixels: Area) => {
    setCroppedAreaPixels(croppedPixels);
  }, []);

  const resetEditor = useCallback(() => {
    setEditing(false);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setAspect(undefined);
    setCroppedAreaPixels(null);
    setCompress(false);
    setQuality(0.8);
  }, []);

  const handleSave = useCallback(async () => {
    if (!config || !croppedAreaPixels) return;
    setProcessing(true);

    try {
      let blob = await getCroppedImage(imageUrl, croppedAreaPixels);

      if (compress) {
        const imageCompression = (await import("browser-image-compression")).default;
        blob = await imageCompression(
          new File([blob], item.name, { type: blob.type || "image/jpeg" }),
          {
            initialQuality: quality,
            useWebWorker: true,
            fileType: "image/jpeg",
          },
        );
      }

      const content = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const base64 = (reader.result as string).replace(/^(.+,)/, "");
          resolve(base64);
        };
        reader.onerror = () => reject(new Error("Failed to read file"));
        reader.readAsDataURL(blob);
      });

      const response = await fetch(
        `/api/${config.owner}/${config.repo}/${encodeURIComponent(config.branch)}/files/${encodeURIComponent(item.path)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "media",
            name: mediaName,
            content,
            contentType: blob.type || "image/jpeg",
            sha: item.sha || undefined,
          }),
        },
      );

      const data = await requireApiSuccess<any>(response, "Failed to save image");
      toast.success(`Saved ${item.name}`);
      onReplace?.(data.data as FileSaveData);
      resetEditor();
      onOpenChange(false);
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Failed to save image");
    } finally {
      setProcessing(false);
    }
  }, [config, croppedAreaPixels, compress, quality, imageUrl, item, mediaName, onReplace, onOpenChange, resetEditor]);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!processing) { if (!o) resetEditor(); onOpenChange(o); } }}>
      <DialogContent className="sm:max-w-3xl p-0 gap-0 overflow-hidden max-h-[90vh] grid-rows-[auto_minmax(0,1fr)_auto]">
        <DialogHeader className="p-4 pb-2 flex-row items-center justify-between gap-2">
          <DialogTitle className="truncate">{item.name}</DialogTitle>
          <div className="flex items-center gap-2 shrink-0">
            {!editing && (
              <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                <Crop className="h-4 w-4 mr-1.5" />
                Edit
              </Button>
            )}
            {!editing && (
              <Button variant="outline" size="sm" asChild>
                <a href={imageUrl} target="_blank" rel="noopener noreferrer" download={item.name}>
                  <Download className="h-4 w-4 mr-1.5" />
                  Download
                </a>
              </Button>
            )}
          </div>
        </DialogHeader>

        {editing ? (
          <>
            <div className="relative h-[400px] bg-muted">
              <Cropper
                image={imageUrl}
                crop={crop}
                zoom={zoom}
                aspect={aspect}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={onCropComplete}
              />
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
                  <Label htmlFor="preview-compress" className="text-sm">Compress image</Label>
                  <p className="text-xs text-muted-foreground">Reduce file size before saving</p>
                </div>
                <Switch
                  id="preview-compress"
                  checked={compress}
                  onCheckedChange={setCompress}
                />
              </div>

              {compress && (
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground w-12">Quality</span>
                  <input
                    type="range"
                    min={0.1}
                    max={1}
                    step={0.1}
                    value={quality}
                    onChange={(e) => setQuality(Number(e.target.value))}
                    className="flex-1 h-1 accent-primary"
                  />
                  <span className="text-xs text-muted-foreground w-8 text-right">
                    {Math.round(quality * 100)}%
                  </span>
                </div>
              )}
            </div>

            <DialogFooter className="p-4 pt-0">
              <Button variant="outline" onClick={resetEditor} disabled={processing}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={processing || !croppedAreaPixels}>
                {processing && <Loader className="h-4 w-4 animate-spin mr-2" />}
                Save
              </Button>
            </DialogFooter>
          </>
        ) : (
          <div className="flex items-center justify-center bg-muted overflow-auto p-4">
            <img
              src={imageUrl}
              alt={item.name}
              className="max-w-full max-h-[60vh] object-contain rounded"
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
