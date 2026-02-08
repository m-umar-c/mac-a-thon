"""
Fetch restaurants within 1 mile of a given point from Google Places API.
Filters: rating (score) above 2.5, more than 10 Google reviews.
Outputs: name, location, rating, review count → JSON file (no review text).
Loads GOOGLE_PLACES_API_KEY from a .env file (or environment).
"""

import json
import os
import time
import urllib.parse
import urllib.request

try:
    from dotenv import load_dotenv  # pyright: ignore[reportMissingImports]
    load_dotenv()
except ImportError:
    pass  # .env not loaded; use GOOGLE_PLACES_API_KEY from environment
# --- Config ---
RADIUS_METERS = 1609  # 1 mile
MIN_RATING = 2.5
MIN_REVIEW_COUNT = 10
BASE_NEARBY = "https://maps.googleapis.com/maps/api/place/nearbysearch/json"
BASE_DETAILS = "https://maps.googleapis.com/maps/api/place/details/json"
DETAILS_FIELDS = "name,formatted_address,geometry,rating,user_ratings_total"


def get_api_key():
    key = os.environ.get("GOOGLE_PLACES_API_KEY")
    if not key:
        raise SystemExit(
            "Set GOOGLE_PLACES_API_KEY in your .env file or environment. "
            "Example .env: GOOGLE_PLACES_API_KEY=your-api-key\n"
            "Get an API key from https://console.cloud.google.com/google/maps-apis/"
        )
    return key


def nearby_search(lat: float, lng: float, api_key: str, page_token: str | None = None):
    params = {
        "location": f"{lat},{lng}",
        "radius": RADIUS_METERS,
        "type": "restaurant",
        "key": api_key,
    }
    if page_token:
        params["pagetoken"] = page_token
    url = BASE_NEARBY + "?" + urllib.parse.urlencode(params)
    with urllib.request.urlopen(url) as resp:
        return json.loads(resp.read().decode())


def place_details(place_id: str, api_key: str):
    params = {
        "place_id": place_id,
        "fields": DETAILS_FIELDS,
        "key": api_key,
    }
    url = BASE_DETAILS + "?" + urllib.parse.urlencode(params)
    with urllib.request.urlopen(url) as resp:
        return json.loads(resp.read().decode())


def fetch_all_nearby_place_ids(
    lat: float, lng: float, api_key: str,
    min_rating: float = MIN_RATING,
    min_review_count: int = MIN_REVIEW_COUNT,
) -> tuple[list[dict], int]:
    """Returns (filtered list, total raw count from API)."""
    place_ids = []
    total_raw = 0
    page_token = None
    while True:
        data = nearby_search(lat, lng, api_key, page_token)
        if data.get("status") != "OK" and data.get("status") != "ZERO_RESULTS":
            raise RuntimeError(f"Nearby search failed: {data.get('status')} - {data.get('error_message', '')}")
        results = data.get("results", [])
        total_raw += len(results)
        for r in results:
            rating = r.get("rating")
            total = r.get("user_ratings_total", 0)
            if rating is None:
                continue
            if rating > min_rating and total > min_review_count:
                place_ids.append({
                    "place_id": r["place_id"],
                    "name": r.get("name"),
                    "lat": r["geometry"]["location"]["lat"],
                    "lng": r["geometry"]["location"]["lng"],
                    "vicinity": r.get("vicinity"),
                })
        page_token = data.get("next_page_token")
        if not page_token:
            break
        time.sleep(2)  # Required before using next_page_token
    return place_ids, total_raw


def fetch_locations(
    lat: float, lng: float, api_key: str, output_path: str = "locations.json",
    min_rating: float = MIN_RATING,
    min_review_count: int = MIN_REVIEW_COUNT,
):
    candidates, total_raw = fetch_all_nearby_place_ids(lat, lng, api_key, min_rating, min_review_count)
    print(f"Nearby search: {total_raw} places found, {len(candidates)} pass filter (rating > {min_rating}, reviews > {min_review_count}).")
    if total_raw == 0:
        print("Tip: Check your coordinates. For Toronto/North America use negative longitude, e.g. 43.6561 -79.3803")
    elif len(candidates) == 0:
        print("Tip: All places were filtered out. Try lowering --min-reviews or --min-rating (see --help).")
    results = []
    for i, c in enumerate(candidates):
        time.sleep(0.1)  # Gentle rate limiting for details
        try:
            data = place_details(c["place_id"], api_key)
        except Exception as e:
            print(f"Details failed for {c.get('name')}: {e}")
            continue
        if data.get("status") != "OK":
            print(f"Details status for {c.get('name')}: {data.get('status')}")
            continue
        result = data.get("result", {})
        results.append({
            "name": result.get("name") or c.get("name"),
            "location": {
                "lat": result.get("geometry", {}).get("location", {}).get("lat") or c["lat"],
                "lng": result.get("geometry", {}).get("location", {}).get("lng") or c["lng"],
                "formatted_address": result.get("formatted_address") or c.get("vicinity"),
            },
            "rating": result.get("rating"),
            "number_of_google_reviews": result.get("user_ratings_total"),
        })
        print(f"  [{i+1}/{len(candidates)}] {results[-1]['name']}")
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump({"restaurants": results, "count": len(results)}, f, indent=2, ensure_ascii=False)
    print(f"Wrote {len(results)} restaurants to {output_path}")
    return results


def main():
    import argparse
    parser = argparse.ArgumentParser(description="Fetch nearby restaurants and save to JSON.")
    parser.add_argument("lat", type=float, help="Latitude of center point")
    parser.add_argument("lng", type=float, help="Longitude of center point")
    parser.add_argument("-o", "--output", default="locations.json", help="Output JSON path")
    parser.add_argument("--min-rating", type=float, default=MIN_RATING, help=f"Minimum rating (default: {MIN_RATING})")
    parser.add_argument("--min-reviews", type=int, default=MIN_REVIEW_COUNT, help=f"Minimum number of reviews (default: {MIN_REVIEW_COUNT})")
    args = parser.parse_args()
    api_key = get_api_key()
    fetch_locations(args.lat, args.lng, api_key, args.output, args.min_rating, args.min_reviews)


if __name__ == "__main__":
    main()
