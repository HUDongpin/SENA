import type { ChangeEvent } from "react";
import {
  Database,
  RotateCcw,
  ShieldCheck,
  Upload
} from "lucide-react";
import { buttonStyles } from "@/components/Primitives";
import type {
  EnterpriseUploadRecord,
  EnterpriseUploadStorageState,
  EnterpriseUploadStorageVerification
} from "./enterprise-contracts";

type EnterpriseUploadStorageRefreshHandler = (options?: { verify?: boolean }) => unknown | Promise<unknown>;
type EnterpriseUploadStorageDeliverHandler = (uploadId?: string) => unknown | Promise<unknown>;

export type EnterpriseUploadStoragePanelProps = {
  disabled: boolean;
  enterpriseUploadStorage: EnterpriseUploadStorageState | null;
  enterpriseUploadVerification: EnterpriseUploadStorageVerification | null;
  enterpriseUploads: EnterpriseUploadRecord[];
  latestEnterpriseUpload?: EnterpriseUploadRecord;
  fileAccept: string;
  onFileInputChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onRefreshUploadStorage: EnterpriseUploadStorageRefreshHandler;
  onDeliverUploadObjectStorage: EnterpriseUploadStorageDeliverHandler;
};

export function EnterpriseUploadStoragePanel({
  disabled,
  enterpriseUploadStorage,
  enterpriseUploadVerification,
  enterpriseUploads,
  latestEnterpriseUpload,
  fileAccept,
  onFileInputChange,
  onRefreshUploadStorage,
  onDeliverUploadObjectStorage
}: EnterpriseUploadStoragePanelProps) {
  return (
    <div data-testid="enterprise-upload-storage" data-visual-role="enterprise-upload-storage-registry" className="grid gap-3 rounded-lg border border-cardBorder/45 bg-background/35 p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs font-black uppercase text-muted">Upload storage</div>
          <div className="mt-1 text-xs font-semibold leading-5 text-muted">
            {enterpriseUploadVerification
              ? `${enterpriseUploadVerification.status} · ${enterpriseUploadVerification.summary.verifiedBlobs}/${enterpriseUploadVerification.summary.registeredUploads} verified · ${enterpriseUploadVerification.summary.missingBlobs} missing · ${enterpriseUploadVerification.summary.checksumMismatches} corrupt`
              : enterpriseUploadStorage
                ? `${enterpriseUploads.length} upload${enterpriseUploads.length === 1 ? "" : "s"} registered · sena-upload-list/v1`
                : "Sign in to load upload registry and blob integrity evidence."}
          </div>
        </div>
        <label className={buttonStyles({ variant: "secondary", size: "sm" })}>
          <Upload className="h-4 w-4" /> Add files
          <input
            data-testid="enterprise-upload-storage-file-input"
            type="file"
            multiple
            accept={fileAccept}
            disabled={disabled}
            className="sr-only"
            onChange={onFileInputChange}
          />
        </label>
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        <button type="button" data-testid="enterprise-upload-storage-refresh" onClick={() => void onRefreshUploadStorage({ verify: false })} disabled={disabled} className={buttonStyles({ variant: "secondary", size: "sm" })}>
          <RotateCcw className="h-4 w-4" /> Registry
        </button>
        <button type="button" data-testid="enterprise-upload-storage-verify" onClick={() => void onRefreshUploadStorage({ verify: true })} disabled={disabled} className={buttonStyles({ variant: "secondary", size: "sm" })}>
          <ShieldCheck className="h-4 w-4" /> Verify blobs
        </button>
        <button type="button" data-testid="enterprise-upload-storage-deliver" onClick={() => void onDeliverUploadObjectStorage(latestEnterpriseUpload?.id)} disabled={disabled || !latestEnterpriseUpload} className={buttonStyles({ variant: "secondary", size: "sm" })}>
          <Database className="h-4 w-4" /> Deliver latest
        </button>
      </div>
      <div className="grid gap-2">
        {!latestEnterpriseUpload && (
          <div className="rounded-lg border border-cardBorder/30 bg-background/30 p-2 text-xs font-semibold text-muted">
            No upload registry records loaded.
          </div>
        )}
        {enterpriseUploads.slice(0, 3).map((upload) => (
          <div key={upload.id} className="grid gap-1 rounded-lg border border-cardBorder/30 bg-background/30 p-2 text-xs font-semibold text-muted">
            <div className="truncate font-black text-foreground">
              {upload.originalName} · {upload.scanStatus} · {Math.round(upload.size / 1024)} KB
            </div>
            <div className="truncate">
              {upload.contentType} · sha256 {upload.sha256.slice(0, 12)} · {new Date(upload.createdAt).toLocaleString()}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
