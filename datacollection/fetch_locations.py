def fetch_locations(
    lat: float,
    lng: float,
    api_key: str,
    output_path: str = "locations.json",
    min_rating: float = MIN_RATING,
    min_review_count: int = MIN_REVIEW_COUNT,
):
    candidates, total_raw = fetch_all_nearby_place_ids(
        lat, lng, api_key, min_rating, min_review_count
    )

    print(
        f"Nearby search: {total_raw} places found, "
        f"{len(candidates)} restaurants pass filter "
        f"(rating > {min_rating}, reviews > {min_review_count})."
    )

    results = []
    for c in candidates:
        results.append({
            "name": c["name"],
            "location": {
                "lat": c["lat"],
                "lng": c["lng"],
                "formatted_address": c.get("vicinity"),
            },
            "rating": c.get("rating"),
            "number_of_google_reviews": c.get("user_ratings_total"),
        })

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(
            {"restaurants": results, "count": len(results)},
            f,
            indent=2,
            ensure_ascii=False,
        )

    print(f"Wrote {len(results)} restaurants to {output_path}")
    return results
