import os
import json
from dotenv import load_dotenv
from google import genai

# Weights for Reference:
# Score = (L * 0.40) + (W * 0.30) + (C * 0.20) + (O * 0.10)

load_dotenv()
# Initialize the 2026 SDK Client
client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

def generate_mock_sustainability(restaurants):
    system_instruction = """
    You are a Toronto sustainability auditor. Create realistic scores (0-100) 
    based on 2026 trends. Provide a concise 'note' (1-2 sentences).
    Return the data as a JSON array of objects.
    """

    # We pass the list of names to the AI to keep the prompt small/cheap
    restaurant_names = [res['name'] for res in restaurants]
    prompt = f"Analyze these Toronto restaurants: {', '.join(restaurant_names)}"

    response = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=prompt,
        config={
            "system_instruction": system_instruction,
            "response_mime_type": "application/json",
            "response_schema": {
                "type": "ARRAY",
                "items": {
                    "type": "OBJECT",
                    "properties": {
                        "name": {"type": "STRING"},
                        "local_sourcing": {"type": "INTEGER"},
                        "waste_mgmt": {"type": "INTEGER"},
                        "certifications": {"type": "INTEGER"},
                        "operations": {"type": "INTEGER"},
                        "sustainability_note": {"type": "STRING"}
                    },
                    "required": ["name", "local_sourcing", "waste_mgmt", "certifications", "operations", "sustainability_note"]
                }
            }
        }
    )
    return json.loads(response.text)

def main():
    # 1. Load your existing data
    input_file = 'mock_restaurants_data.json'
    with open(input_file, 'r') as f:
        mock_list = json.load(f)

    print(f"Generating sustainability data for {len(mock_list)} restaurants...")
    
    # 2. FIX: Call the correctly named function
    enriched_results = generate_mock_sustainability(mock_list)

    # 3. Apply the formula and merge data
    # We use a dictionary for fast lookup by name
    results_map = {item['name']: item for item in enriched_results}

    for res in mock_list:
        data = results_map.get(res['name'])
        if data:
            # Calculation based on your specific weighted formula
            total = (
                (data['local_sourcing'] * 0.40) +
                (data['waste_mgmt'] * 0.30) +
                (data['certifications'] * 0.20) +
                (data['operations'] * 0.10)
            )
            res['sustainability_score'] = round(total, 1)
            res['sustainability_note'] = data['sustainability_note']
            res['breakdown'] = {
                "local": data['local_sourcing'],
                "waste": data['waste_mgmt'],
                "cert": data['certifications'],
                "ops": data['operations']
            }

    # 4. Save the finalized file
    output_file = 'final_sustainability_mock.json'
    with open(output_file, 'w') as f:
        json.dump(mock_list, f, indent=2)
    
    print(f"Success! Scored data saved to {output_file}")

if __name__ == "__main__":
    main()