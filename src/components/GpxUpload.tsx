import { useCallback, useRef, useState } from "react";
import { Alert, Button } from "../design-system/components";

type GpxUploadProps = {
  onFile: (file: File) => void;
  onSample?: () => void;
  error: string | null;
  isLoading: boolean;
};

function UploadIcon() {
  return (
    <svg
      className="ds-upload-zone__icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden
    >
      <path d="M12 16V4m0 0l-4 4m4-4l4 4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" strokeLinecap="round" />
    </svg>
  );
}

export function GpxUpload({ onFile, onSample, error, isLoading }: GpxUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);

  const handleFiles = useCallback(
    (files: FileList | null) => {
      const file = files?.[0];
      if (file) onFile(file);
    },
    [onFile],
  );

  return (
    <section className="ds-upload-zone" aria-labelledby="upload-title">
      <div
        className={`ds-upload-zone__drop${dragActive ? " ds-upload-zone__drop--active" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragActive(false);
          handleFiles(e.dataTransfer.files);
        }}
      >
        <UploadIcon />
        <h2 id="upload-title" className="ds-upload-zone__title">
          {isLoading ? "Reading your route…" : "Import your run"}
        </h2>
        <p className="ds-upload-zone__hint">
          Drop your GPX file here, or browse. Works with Strava, Apple Watch, and
          Garmin exports.
        </p>
        <div className="ds-upload-zone__actions">
          <Button
            loading={isLoading}
            disabled={isLoading}
            onClick={() => inputRef.current?.click()}
          >
            {isLoading ? "Parsing…" : "Choose GPX file"}
          </Button>
          {onSample && (
            <Button variant="ghost" disabled={isLoading} onClick={onSample}>
              Try sample run
            </Button>
          )}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept=".gpx,application/gpx+xml,application/xml,text/xml"
          className="sr-only"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>
      {error && <Alert spaced>{error}</Alert>}
    </section>
  );
}
