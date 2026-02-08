import os
import json
import requests
from dotenv import load_dotenv

load_dotenv()
MAPS_KEY = os.getenv("GOOGLE_MAPS_API_KEY")

def fetch_place_ids(input_file):
    with open(input_file, 'r') as f:
        restaurants = json.load(f)

    headers = {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": MAPS_KEY,
        "X-Goog-FieldMask": "places.id,places.displayName"
    }

    for res in restaurants:
        if res.get('place_id'): continue # Skip if already has ID
        
        print(f"Finding ID for: {res['name']}")
        # We add 'Toronto' to the query to ensure accuracy
        payload = {"textQuery": f"{res['name']} restaurant Toronto"}
        
        response = requests.post(
            "https://places.googleapis.com/v1/places:searchText",
            headers=headers,
            json=payload
        )
        
        data = response.json()
        if "places" in data and len(data["places"]) > 0:
            res['place_id'] = data["places"][0]["id"]
            print(f" -> Found: {res['place_id']}")
        else:
            print(f" -> Could not find ID for {res['name']}")

    with open(input_file, 'w') as f:
        json.dump(restaurants, f, indent=2)
    print("\nAll IDs updated in mock_restaurants_data.json!")

if __name__ == "__main__":
    fetch_place_ids('mock_restaurants_data.json')