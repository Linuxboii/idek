"""
Real Estate Business Finder using Apify + Google Maps Scraper

Features:
- Interactive CLI prompts
- Uses Apify Google Maps Scraper
- Advanced filtering for real estate businesses
- Saves leads to CSV
- Optional website/email extraction
- Works within Apify free tier if usage is moderate

Requirements:
pip install requests pandas openpyxl

Run:
python real_estate_leads.py
"""

import requests
import time
import pandas as pd

APIFY_BASE_URL = "https://api.apify.com/v2"


def ask_questions():
    print("\n=== Real Estate Lead Finder ===\n")

    token = input("Enter your Apify API Token: ").strip()

    print("\nWhat type of real estate businesses do you want?")
    print("Examples:")
    print("- Real estate agency")
    print("- Property management")
    print("- Builders")
    print("- Realtors")
    print("- Commercial real estate")
    print("- Luxury real estate")

    business_type = input("\nBusiness type: ").strip()

    print("\nLocation search examples:")
    print("- Hyderabad")
    print("- Bangalore")
    print("- Dubai")
    print("- Miami")

    location = input("\nLocation: ").strip()

    max_results = input("\nHow many results? (recommended under 100 for free tier): ").strip()

    if not max_results.isdigit():
        max_results = 50
    else:
        max_results = int(max_results)

    print("\nAdditional filters (optional)")

    min_rating = input("Minimum Google rating (example 4.0): ").strip()

    return {
        "token": token,
        "business_type": business_type,
        "location": location,
        "max_results": max_results,
        "min_rating": min_rating,
        "extract_emails": False
    }


def run_google_maps_scraper(config):
    token = config["token"]

    search_query = f"{config['business_type']} in {config['location']}"

    print(f"\nSearching for: {search_query}")

    actor_input = {
        "searchStringsArray": [search_query],
        "maxCrawledPlacesPerSearch": config["max_results"],
        "maxCrawledPlaces": config["max_results"],
        "language": "en",
        "exportPlaceUrls": False,
        "scrapeContacts": config["extract_emails"],
        "zoom": 12,
        "maxAutomaticZoomOut": 4
    }

    url = f"{APIFY_BASE_URL}/acts/compass~crawler-google-places/runs?token={token}"

    response = requests.post(url, json=actor_input)

    if response.status_code != 201:
        print("\nError starting scraper:")
        print(response.text)
        return None

    data = response.json()
    run_id = data["data"]["id"]

    print(f"\nActor started. Run ID: {run_id}")
    print("Waiting for completion...\n")

    max_polls = 60  # 10 minutes max
    for _ in range(max_polls):
        status_url = f"{APIFY_BASE_URL}/actor-runs/{run_id}?token={token}"
        status_resp = requests.get(status_url)

        if status_resp.status_code != 200:
            print(f"\nFailed to get run status: {status_resp.text}")
            return None

        status_data = status_resp.json()
        status = status_data["data"]["status"]

        print(f"Status: {status}")

        if status == "SUCCEEDED":
            dataset_id = status_data["data"]["defaultDatasetId"]
            return dataset_id

        elif status in ["FAILED", "ABORTED", "TIMED-OUT"]:
            print("\nScraper failed.")
            return None

        time.sleep(10)

    print("\nTimed out waiting for scraper to finish.")
    return None


def get_dataset_items(token, dataset_id):
    dataset_url = (
        f"{APIFY_BASE_URL}/datasets/{dataset_id}/items"
        f"?token={token}&clean=true"
    )

    response = requests.get(dataset_url)

    if response.status_code != 200:
        print("Failed to fetch dataset.")
        return []

    return response.json()


def filter_results(results, min_rating):
    filtered = []

    for item in results:
        rating = item.get("totalScore")

        if min_rating:
            try:
                if rating is not None and float(rating) < float(min_rating):
                    continue
            except (ValueError, TypeError):
                pass

        filtered.append(item)

    return filtered


def extract_useful_fields(results):
    extracted = []

    for item in results:
        phone = item.get("phone") or item.get("phoneUnformatted")
        if not phone:
            continue
        extracted.append({
            "Business Name": item.get("title"),
            "Phone Number": phone
        })

    return extracted


def save_excel(data):
    df = pd.DataFrame(data)

    filename = "real_estate_leads.xlsx"

    df.to_excel(filename, index=False, engine="openpyxl")

    print(f"\nSaved {len(df)} leads to {filename}")


def main():
    config = ask_questions()

    dataset_id = run_google_maps_scraper(config)

    if not dataset_id:
        return

    print("\nFetching results...\n")

    results = get_dataset_items(config["token"], dataset_id)

    print(f"Total raw results: {len(results)}")

    filtered = filter_results(results, config["min_rating"])

    print(f"Filtered results: {len(filtered)}")

    extracted = extract_useful_fields(filtered)

    save_excel(extracted)

    print("\nDone.")


if __name__ == "__main__":
    main()