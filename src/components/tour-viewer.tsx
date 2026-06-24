"use client";

interface TourViewerProps {
  plyUrl: string;
}

export default function TourViewer({ plyUrl }: TourViewerProps) {
  const src = `/viewer?content=${encodeURIComponent(plyUrl)}&noui`;

  return (
    <iframe
      src={src}
      className="w-full h-full border-0"
      style={{ minHeight: 400 }}
      allow="xr-spatial-tracking"
      title="3D Tour Viewer"
    />
  );
}
