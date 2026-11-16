import { User } from "lucide-react";
import { Link } from "react-router";
import { artworkUrl } from "@/lib/tidalImage";
import type { ArtistCard } from "@/types/media";

// Round artist picture with the name below; opens the artist page.
export function ArtistCardLink({ artist }: { artist: ArtistCard }) {
  const picture = artist.picture ? artworkUrl(artist.picture, 640) : undefined;
  return (
    <Link to={`/artists/${artist.id}`} className="group w-32 shrink-0 text-center outline-none">
      {picture ? (
        <img
          src={picture}
          alt=""
          className="aspect-square w-32 rounded-full object-cover transition-opacity group-hover:opacity-90"
          loading="lazy"
        />
      ) : (
        <div className="flex aspect-square w-32 items-center justify-center rounded-full bg-muted">
          <User className="size-8 text-muted-foreground" aria-hidden />
        </div>
      )}
      <p className="mt-2 truncate text-sm font-medium group-hover:underline" title={artist.name}>
        {artist.name}
      </p>
    </Link>
  );
}
