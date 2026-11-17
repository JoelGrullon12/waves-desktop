import { Fragment } from "react";
import { Link } from "react-router";
import type { ArtistSummary } from "@/types/track";

// "Artist A, Artist B" with each name opening that artist's page.
export function ArtistLinks({ artists }: { artists: ArtistSummary[] }) {
  return (
    <>
      {artists.map((artist, index) => (
        <Fragment key={artist.id}>
          {index > 0 && ", "}
          <Link
            to={`/artists/${artist.id}`}
            className="hover:text-foreground hover:underline"
            // Rows start playback on click; a link inside one must not.
            onClick={(event) => event.stopPropagation()}
          >
            {artist.name}
          </Link>
        </Fragment>
      ))}
    </>
  );
}
