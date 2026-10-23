import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

interface HorizontalScrollProps {
  title: string;
  children: ReactNode;
}

// A titled horizontally scrolling row of fixed-width cards with arrow controls
// on the title line. The scrollbar is hidden; the arrows scroll by ~90% of the
// viewport and disable when the corresponding edge is reached.
export function HorizontalScroll({ title, children }: HorizontalScrollProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollState = useCallback(() => {
    const container = scrollRef.current;
    if (!container) return;
    const maxScrollLeft = container.scrollWidth - container.clientWidth;
    setCanScrollLeft(container.scrollLeft > 1);
    setCanScrollRight(container.scrollLeft < maxScrollLeft - 1);
  }, []);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    const observer = new ResizeObserver(updateScrollState);
    observer.observe(container);
    return () => observer.disconnect();
  }, [updateScrollState]);

  // Re-measure after every render so arrows appear once the cards load. The
  // boolean state only changes when an edge is actually reached, so this does
  // not loop.
  useEffect(() => {
    updateScrollState();
  });

  const scrollByDirection = (direction: -1 | 1): void => {
    const container = scrollRef.current;
    if (!container) return;
    container.scrollBy({ left: direction * container.clientWidth * 0.9, behavior: "smooth" });
  };

  return (
    <div className="flex flex-col">
      <div className="mb-2 flex items-center justify-between px-2">
        <h2 className="text-lg font-bold">{title}</h2>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => scrollByDirection(-1)}
            disabled={!canScrollLeft}
            aria-label={`Scroll ${title} left`}
          >
            <ChevronLeft className="size-4" aria-hidden />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => scrollByDirection(1)}
            disabled={!canScrollRight}
            aria-label={`Scroll ${title} right`}
          >
            <ChevronRight className="size-4" aria-hidden />
          </Button>
        </div>
      </div>

      <div
        ref={scrollRef}
        onScroll={updateScrollState}
        className="flex gap-3 overflow-x-auto px-2 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {children}
      </div>
    </div>
  );
}
