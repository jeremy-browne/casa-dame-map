import csv
import time
from geopy.geocoders import Nominatim
from geopy.extra.rate_limiter import RateLimiter

# Initialize the geocoder with a custom user agent
geolocator = Nominatim(user_agent="casa_dame_geocoder")
# RateLimiter ensures we do not exceed Nominatim's usage policy (1 req/sec)
geocode = RateLimiter(geolocator.geocode, min_delay_seconds=1)

input_file = "aviation_medical_contacts.csv"
output_file = "aviation_medical_contacts_geocoded.csv"

with open(input_file, newline="", encoding="utf-8") as infile, \
     open(output_file, "w", newline="", encoding="utf-8") as outfile:
    reader = csv.DictReader(infile)
    # Append new columns for latitude and longitude
    fieldnames = reader.fieldnames + ["Lat", "Lng"]
    writer = csv.DictWriter(outfile, fieldnames=fieldnames)
    writer.writeheader()
    
    for row in reader:
        # Build a full address from available columns.
        address_parts = []
        for field in ["Address2", "Suburb", "State", "Postcode", "Country"]:
            if row.get(field) and row[field].strip():
                address_parts.append(row[field].strip())
        full_address = ", ".join(address_parts)
        print("Geocoding:", full_address)
        
        try:
            location = geocode(full_address)
            if location:
                row["Lat"] = location.latitude
                row["Lng"] = location.longitude
                print("  Found:", location.latitude, location.longitude)
            else:
                row["Lat"] = ""
                row["Lng"] = ""
                print("  Not found")
        except Exception as e:
            print(f"Error geocoding '{full_address}':", e)
            row["Lat"] = ""
            row["Lng"] = ""
        
        writer.writerow(row)

print(f"Geocoding complete. Output saved to {output_file}")
