'use client';

import { FileUp, ImagePlus, Paperclip, Upload, X } from 'lucide-react';
import Image from 'next/image';
import * as React from 'react';
import { useCallback, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

interface FileUploadLabels {
  dropzoneText?: string | undefined;
  dropzoneHighlight?: string | undefined;
  dropzoneHint?: string | undefined;
  browseButton?: string | undefined;
  removeLabel?: string | undefined;
  dragActive?: string | undefined;
}

const DEFAULT_LABELS: Required<FileUploadLabels> = {
  dropzoneText: 'Arrastra un archivo aquí o',
  dropzoneHighlight: 'haz clic para seleccionar',
  dropzoneHint: 'Máx. 5 MB',
  browseButton: 'Elegir archivo',
  removeLabel: 'Quitar',
  dragActive: 'Suelta el archivo aquí',
};

function mergeLabels(custom?: FileUploadLabels): Required<FileUploadLabels> {
  if (!custom) {
    return DEFAULT_LABELS;
  }
  return { ...DEFAULT_LABELS, ...custom };
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ---------------------------------------------------------------------------
// FileDropzone — large drag & drop area
// ---------------------------------------------------------------------------

interface FileDropzoneProps {
  accept?: string | undefined;
  multiple?: boolean | undefined;
  maxSizeMB?: number | undefined;
  disabled?: boolean | undefined;
  labels?: FileUploadLabels | undefined;
  onChange?: ((files: File[]) => void) | undefined;
  className?: string | undefined;
}

function FileDropzone({
  accept,
  multiple = false,
  maxSizeMB = 5,
  disabled = false,
  labels: labelsProp,
  onChange,
  className,
}: FileDropzoneProps): React.JSX.Element {
  const labels = mergeLabels(labelsProp);
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [files, setFiles] = useState<File[]>([]);

  const handleFiles = useCallback(
    (incoming: FileList | null) => {
      if (!incoming) {
        return;
      }
      const maxBytes = maxSizeMB * 1024 * 1024;
      const valid = Array.from(incoming).filter((f) => f.size <= maxBytes);
      const next = multiple ? valid : valid.slice(0, 1);
      setFiles(next);
      onChange?.(next);
    },
    [maxSizeMB, multiple, onChange],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      if (!disabled) {
        handleFiles(e.dataTransfer.files);
      }
    },
    [disabled, handleFiles],
  );

  const removeFile = useCallback(
    (index: number) => {
      setFiles((prev) => {
        const next = prev.filter((_, i) => i !== index);
        onChange?.(next);
        return next;
      });
    },
    [onChange],
  );

  return (
    <div className={cn('space-y-2', className)}>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) {
            setIsDragOver(true);
          }
        }}
        onDragLeave={() => {
          setIsDragOver(false);
        }}
        onDrop={handleDrop}
        onClick={() => {
          if (!disabled) {
            inputRef.current?.click();
          }
        }}
        className={cn(
          'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-6 py-8 text-center transition-colors',
          isDragOver
            ? 'border-primary bg-primary/10'
            : 'border-border hover:border-primary/50 hover:bg-primary/5',
          disabled && 'pointer-events-none opacity-50',
        )}
      >
        <Upload
          className={cn(
            'h-8 w-8 transition-colors',
            isDragOver ? 'text-primary' : 'text-muted-foreground',
          )}
        />
        {isDragOver ? (
          <p className="text-sm font-medium text-primary">{labels.dragActive}</p>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              {labels.dropzoneText}{' '}
              <span className="font-medium text-primary">{labels.dropzoneHighlight}</span>
            </p>
            <p className="text-xs text-muted-foreground/70">
              {accept ? accept.replace(/,/g, ', ') : 'Cualquier archivo'} — máx. {maxSizeMB} MB
            </p>
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple={multiple}
          disabled={disabled}
          onChange={(e) => {
            handleFiles(e.target.files);
          }}
          className="hidden"
        />
      </div>

      {files.length > 0 && (
        <ul className="space-y-1">
          {files.map((file, i) => (
            <li
              key={`${file.name}-${i}`}
              className="flex items-center gap-2 rounded-md border bg-card px-3 py-2 text-sm animate-in fade-in-0 slide-in-from-top-1 duration-200"
            >
              <Paperclip className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">{file.name}</span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {formatFileSize(file.size)}
              </span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  removeFile(i);
                }}
                className="shrink-0 rounded-sm p-0.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                aria-label={labels.removeLabel}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// FileInputButton — compact button-style file picker
// ---------------------------------------------------------------------------

interface FileInputButtonProps {
  accept?: string | undefined;
  multiple?: boolean | undefined;
  maxSizeMB?: number | undefined;
  disabled?: boolean | undefined;
  labels?: FileUploadLabels | undefined;
  onChange?: ((files: File[]) => void) | undefined;
  className?: string | undefined;
}

function FileInputButton({
  accept,
  multiple = false,
  maxSizeMB = 5,
  disabled = false,
  labels: labelsProp,
  onChange,
  className,
}: FileInputButtonProps): React.JSX.Element {
  const labels = mergeLabels(labelsProp);
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);

  const handleFiles = useCallback(
    (incoming: FileList | null) => {
      if (!incoming) {
        return;
      }
      const maxBytes = maxSizeMB * 1024 * 1024;
      const valid = Array.from(incoming).filter((f) => f.size <= maxBytes);
      const next = multiple ? valid : valid.slice(0, 1);
      setFiles(next);
      onChange?.(next);
    },
    [maxSizeMB, multiple, onChange],
  );

  const clear = useCallback(() => {
    setFiles([]);
    onChange?.([]);
    if (inputRef.current) {
      inputRef.current.value = '';
    }
  }, [onChange]);

  const fileName =
    files.length === 1 ? files[0]?.name : files.length > 1 ? `${files.length} archivos` : null;

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled}
        onClick={() => {
          inputRef.current?.click();
        }}
        className="shrink-0 gap-1.5"
      >
        <FileUp className="h-4 w-4" />
        {labels.browseButton}
      </Button>
      {fileName ? (
        <div className="flex min-w-0 items-center gap-1.5 animate-in fade-in-0 duration-150">
          <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="min-w-0 truncate text-sm">{fileName}</span>
          <button
            type="button"
            onClick={clear}
            className="shrink-0 rounded-sm p-0.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
            aria-label={labels.removeLabel}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <span className="text-sm text-muted-foreground">Sin archivo seleccionado</span>
      )}
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        disabled={disabled}
        onChange={(e) => {
          handleFiles(e.target.files);
        }}
        className="hidden"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// FileInputAvatar — circular image upload with preview
// ---------------------------------------------------------------------------

interface FileInputAvatarProps {
  accept?: string | undefined;
  maxSizeMB?: number | undefined;
  disabled?: boolean | undefined;
  size?: number | undefined;
  labels?: FileUploadLabels | undefined;
  onChange?: ((file: File | null) => void) | undefined;
  className?: string | undefined;
}

function FileInputAvatar({
  accept = 'image/*',
  maxSizeMB = 5,
  disabled = false,
  size = 96,
  labels: labelsProp,
  onChange,
  className,
}: FileInputAvatarProps): React.JSX.Element {
  const labels = mergeLabels(labelsProp);
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const handleFile = useCallback(
    (incoming: FileList | null) => {
      const file = incoming?.[0];
      if (!file) {
        return;
      }
      if (file.size > maxSizeMB * 1024 * 1024) {
        return;
      }
      const url = URL.createObjectURL(file);
      setPreview((prev) => {
        if (prev) {
          URL.revokeObjectURL(prev);
        }
        return url;
      });
      onChange?.(file);
    },
    [maxSizeMB, onChange],
  );

  const clear = useCallback(() => {
    setPreview((prev) => {
      if (prev) {
        URL.revokeObjectURL(prev);
      }
      return null;
    });
    onChange?.(null);
    if (inputRef.current) {
      inputRef.current.value = '';
    }
  }, [onChange]);

  return (
    <div className={cn('flex items-center gap-4', className)}>
      <div
        onClick={() => {
          if (!disabled) {
            inputRef.current?.click();
          }
        }}
        className={cn(
          'group relative flex shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-full border-2 border-dashed transition-colors',
          preview ? 'border-primary/40' : 'border-border hover:border-primary/50',
          disabled && 'pointer-events-none opacity-50',
        )}
        style={{ width: size, height: size }}
      >
        {preview ? (
          <>
            <Image src={preview} alt="Vista previa" fill className="object-cover" unoptimized />
            <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
              <ImagePlus className="h-5 w-5 text-white" />
            </div>
          </>
        ) : (
          <ImagePlus className="h-6 w-6 text-muted-foreground transition-colors group-hover:text-primary" />
        )}
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          disabled={disabled}
          onChange={(e) => {
            handleFile(e.target.files);
          }}
          className="hidden"
        />
      </div>
      <div className="flex flex-col gap-1">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={() => {
            inputRef.current?.click();
          }}
          className="gap-1.5"
        >
          <Upload className="h-3.5 w-3.5" />
          {labels.browseButton}
        </Button>
        {preview && (
          <button
            type="button"
            onClick={clear}
            className="text-xs text-muted-foreground transition-colors hover:text-destructive"
          >
            {labels.removeLabel}
          </button>
        )}
      </div>
    </div>
  );
}

export { FileDropzone, FileInputButton, FileInputAvatar };
export type { FileDropzoneProps, FileInputButtonProps, FileInputAvatarProps, FileUploadLabels };
