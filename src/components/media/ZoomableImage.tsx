import { X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

// TIDAL artwork URLs end in "<width>x<height>.jpg"; the 1280 file exists for
// albums and most playlists. When it does not, the viewer falls back to the
// image already shown.
const LARGE_ARTWORK_SIZE = 1280;

export function largeArtworkUrl(url: string): string {
  return url.replace(/\/\d+x\d+\.jpg(\?.*)?$/, `/${LARGE_ARTWORK_SIZE}x${LARGE_ARTWORK_SIZE}.jpg`);
}

function ImageViewer({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  const [currentSource, setCurrentSource] = useState(() => largeArtworkUrl(src));

  useEffect(() => {
    // Captured first and stopped, so Escape closes only the viewer and not the
    // panel underneath it.
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      onClose();
    };
    window.addEventListener("keydown", closeOnEscape, true);
    return () => window.removeEventListener("keydown", closeOnEscape, true);
  }, [onClose]);

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={alt}
      data-testid="image-viewer"
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 p-8"
      onClick={onClose}
    >
      <button
        type="button"
        aria-label="Close image"
        className="absolute top-4 right-4 rounded-full p-2 text-white/80 hover:bg-white/10 hover:text-white"
        onClick={onClose}
      >
        <X className="size-5" aria-hidden />
      </button>
      <img
        src={currentSource}
        alt={alt}
        className="max-h-full max-w-full rounded-lg object-contain shadow-2xl"
        onClick={(event) => event.stopPropagation()}
        onError={() => {
          if (currentSource !== src) setCurrentSource(src);
        }}
      />
    </div>,
    document.body,
  );
}

// An image that opens full size when clicked (the cover of the playing track,
// album/playlist headers, the artist picture).
export function ZoomableImage({
  src,
  alt,
  className,
  buttonClassName,
  children,
}: {
  src: string;
  alt: string;
  className?: string;
  buttonClassName?: string;
  // Rendered instead of the plain <img> (for custom markup); still opens `src`.
  children?: ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        title="View larger"
        aria-label={`View ${alt} larger`}
        className={`shrink-0 cursor-zoom-in rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring ${buttonClassName ?? ""}`}
        onClick={(event) => {
          event.stopPropagation();
          setIsOpen(true);
        }}
      >
        {children ?? <img src={src} alt={alt} className={className} />}
      </button>
      {isOpen && <ImageViewer src={src} alt={alt} onClose={() => setIsOpen(false)} />}
    </>
  );
}
