use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};

// Mirrors src/types/track.ts. The TIDAL v2 API is JSON:API: resource objects
// carry `attributes`/`relationships`, related resources are returned in the
// compound `included` list, ids are opaque strings and durations are ISO-8601
// ("PT2M58S"). Parsing is deliberately tolerant: missing fields default
// instead of failing, because not every resource carries every member.

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CatalogArtist {
    pub id: String,
    pub name: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CatalogAlbum {
    pub id: String,
    pub title: String,
    /// TIDAL artwork id used to build the cover URL, e.g.
    /// `https://tidal.com/images/{cover}/640x640.jpg`.
    pub cover: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Track {
    pub id: String,
    pub title: String,
    /// Duration in seconds.
    pub duration: u32,
    #[serde(default)]
    pub track_number: Option<u32>,
    #[serde(default)]
    pub volume_number: Option<u32>,
    #[serde(default)]
    pub artists: Vec<CatalogArtist>,
    #[serde(default)]
    pub album: Option<CatalogAlbum>,
    #[serde(default)]
    pub audio_quality: Option<String>,
    /// Always true from the catalog proxy: streamability is validated by the
    /// SDK against the user's subscription at playback time.
    pub is_playable: bool,
}

// --- JSON:API wire types ---------------------------------------------------

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResourceIdentifierMeta {
    #[serde(default)]
    pub track_number: Option<u32>,
    #[serde(default)]
    pub volume_number: Option<u32>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResourceIdentifier {
    pub id: String,
    #[serde(rename = "type")]
    pub type_: String,
    #[serde(default)]
    pub meta: Option<ResourceIdentifierMeta>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResourceObject {
    pub id: String,
    #[serde(default)]
    pub attributes: serde_json::Value,
    #[serde(default)]
    pub relationships: serde_json::Value,
}

/// Document returned by relationship endpoints (/albums/{id}/relationships/...).
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RelationshipDocument {
    pub data: Vec<ResourceIdentifier>,
    #[serde(default)]
    pub included: Vec<ResourceObject>,
}

/// Compound document returned by collection endpoints (searchResults, ...).
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MultiResourceDocument {
    pub data: Vec<ResourceObject>,
    #[serde(default)]
    pub included: Vec<ResourceObject>,
}

// --- conversion helpers -----------------------------------------------------

fn index_resources(resources: &[ResourceObject]) -> HashMap<String, &ResourceObject> {
    resources
        .iter()
        .map(|resource| (resource.id.clone(), resource))
        .collect()
}

fn attribute_string(resource: &ResourceObject, key: &str) -> Option<String> {
    resource
        .attributes
        .get(key)
        .and_then(|value| value.as_str())
        .map(String::from)
}

fn attribute_string_array(resource: &ResourceObject, key: &str) -> Vec<String> {
    resource
        .attributes
        .get(key)
        .and_then(|value| value.as_array())
        .map(|items| {
            items
                .iter()
                .filter_map(|item| item.as_str().map(String::from))
                .collect()
        })
        .unwrap_or_default()
}

fn relationships_ids(relationships: &serde_json::Value, relationship: &str) -> Vec<String> {
    relationships
        .get(relationship)
        .and_then(|rel| rel.get("data"))
        .and_then(|data| data.as_array())
        .map(|items| {
            items
                .iter()
                .filter_map(|item| item.get("id").and_then(|id| id.as_str()).map(String::from))
                .collect()
        })
        .unwrap_or_default()
}

fn relationship_data_ids(resource: &ResourceObject, relationship: &str) -> Vec<String> {
    relationships_ids(&resource.relationships, relationship)
}

// Tracks are only seconds-long in practice ("PT2M58S"); the parser covers the
// H/M/S components and ignores days for forward compatibility.
fn iso8601_duration_to_seconds(value: &str) -> u32 {
    let mut total_seconds: u64 = 0;
    let mut digits = String::new();
    for ch in value.chars() {
        match ch {
            'P' | 'T' => {}
            'D' => {
                digits.clear();
            }
            'H' | 'M' | 'S' => {
                if let Ok(multiplier) = digits.parse::<u64>() {
                    let seconds = match ch {
                        'H' => multiplier * 3600,
                        'M' => multiplier * 60,
                        'S' => multiplier,
                        _ => 0,
                    };
                    total_seconds += seconds;
                }
                digits.clear();
            }
            _ if ch.is_ascii_digit() => digits.push(ch),
            _ => digits.clear(),
        }
    }
    total_seconds.min(u32::MAX as u64) as u32
}

fn media_tag_to_quality(media_tags: &[String]) -> Option<String> {
    const PREFERRED: &[&str] = &[
        "HI_RES_LOSSLESS",
        "LOSSLESS",
        "DOLBY_ATMOS",
        "SONY_360RA",
        "HIGH",
        "LOW",
    ];
    for preferred in PREFERRED {
        // The API spells the first one "HIRES_LOSSLESS".
        let expected = if *preferred == "HI_RES_LOSSLESS" {
            "HIRES_LOSSLESS"
        } else {
            *preferred
        };
        if media_tags
            .iter()
            .any(|tag| tag.eq_ignore_ascii_case(expected))
        {
            return Some((*preferred).to_string());
        }
    }
    None
}

impl Track {
    /// Builds a Track from a v2 track resource, resolving its album, cover art
    /// and artists against the resources carried in the compound document.
    pub fn from_v2_resource(
        resource: &ResourceObject,
        by_id: &HashMap<String, &ResourceObject>,
        track_number: Option<u32>,
        volume_number: Option<u32>,
    ) -> Track {
        let artists = relationship_data_ids(resource, "artists")
            .into_iter()
            .filter_map(|id| by_id.get(&id))
            .map(|artist| CatalogArtist {
                id: artist.id.clone(),
                name: attribute_string(artist, "name").unwrap_or_default(),
            })
            .collect::<Vec<_>>();

        let album = relationship_data_ids(resource, "albums")
            .into_iter()
            .next()
            .and_then(|id| by_id.get(&id))
            .map(|album| CatalogAlbum {
                id: album.id.clone(),
                title: attribute_string(album, "title").unwrap_or_default(),
                cover: relationship_data_ids(album, "coverArt").into_iter().next(),
            });

        let audio_quality = media_tag_to_quality(&attribute_string_array(resource, "mediaTags"));

        Track {
            id: resource.id.clone(),
            title: attribute_string(resource, "title").unwrap_or_default(),
            duration: attribute_string(resource, "duration")
                .map(|value| iso8601_duration_to_seconds(&value))
                .unwrap_or(0),
            track_number,
            volume_number,
            artists,
            album,
            audio_quality,
            is_playable: true,
        }
    }
}

/// Converts a search compound document to Tracks, honoring the relevance order
/// of the searchResults `tracks` relationship (the `included` list order is
/// not guaranteed to be meaningful).
pub fn tracks_from_search(document: &MultiResourceDocument) -> Vec<Track> {
    let by_id = index_resources(&document.included);
    let mut ordered_track_ids: Vec<String> = Vec::new();
    for search_results in &document.data {
        ordered_track_ids.extend(relationships_ids(&search_results.relationships, "tracks"));
    }

    let mut seen = HashSet::new();
    ordered_track_ids
        .iter()
        .filter(|id| seen.insert((*id).clone()))
        .filter_map(|id| by_id.get(id))
        .map(|resource| Track::from_v2_resource(resource, &by_id, None, None))
        .collect()
}

/// Converts an items relationship (album or playlist) to Tracks, honoring the
/// relationship order and, when present, the per-item track/volume numbers.
pub fn tracks_from_items(document: &RelationshipDocument) -> Vec<Track> {
    let included = &document.included;
    let by_id = index_resources(included);
    document
        .data
        .iter()
        .filter(|identifier| identifier.type_ == "tracks")
        .filter_map(|identifier| {
            by_id.get(&identifier.id).map(|resource| {
                let track_number = identifier.meta.as_ref().and_then(|meta| meta.track_number);
                let volume_number = identifier.meta.as_ref().and_then(|meta| meta.volume_number);
                Track::from_v2_resource(resource, &by_id, track_number, volume_number)
            })
        })
        .collect()
}
