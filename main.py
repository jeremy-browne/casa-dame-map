import time
import csv
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from bs4 import BeautifulSoup

# Selenium setup (headless mode)
options = Options()
options.add_argument("--headless")
options.add_argument("--disable-gpu")
options.add_argument("--window-size=1920,1080")
driver = webdriver.Chrome(options=options)

BASE_URL = "https://www.casa.gov.au/search-centre/aviation-medical-contacts"

def extract_text(element, selector):
    tag = element.select_one(selector)
    return tag.get_text(strip=True) if tag else ""

def clean_name(name):
    parts = name.split(" - ")
    return parts[0].strip()

def get_total_pages():
    # Load the first page and wait for JavaScript to complete.
    driver.get(f"{BASE_URL}?page=1")
    time.sleep(5)
    try:
        # Locate the "Last" page link element using the new API
        last_link = driver.find_element(By.CSS_SELECTOR, "li#pager-pg-last a")
        last_href = last_link.get_attribute("href")
        total_pages = int(last_href.split("page=")[1])
        print(f"Total pages found: {total_pages}")
        return total_pages
    except Exception as e:
        print("Error getting total pages:", e)
        return None

def scrape_page(page_num):
    url = f"{BASE_URL}?page={page_num}"
    print(f"Scraping page: {url}")
    driver.get(url)
    time.sleep(5)  # wait for JS to load
    soup = BeautifulSoup(driver.page_source, "html.parser")
    articles = soup.select("div.view-content div.views-row article")
    if not articles:
        print(f"No articles found on page {page_num}")
        return []
    
    records = []
    for article in articles:
        card_body = article.select_one("div.card-body")
        if not card_body:
            continue
        
        record = {}
        raw_name = extract_text(card_body, "h3.card-title span.field--name-title")
        record["Name"] = clean_name(raw_name)
        
        updated = extract_text(card_body, "span.dt-last-updated")
        if updated.lower().startswith("updated"):
            updated = updated[len("updated"):].strip()
        record["Updated"] = updated
        
        record["Gender"]   = extract_text(card_body, "div.field--name-field-gender-options div.field__item")
        record["Address1"] = extract_text(card_body, "div.field--name-field-address-1")
        record["Address2"] = extract_text(card_body, "div.field--name-field-address-2")
        record["Suburb"]   = extract_text(card_body, "span.field--name-field-tx-suburb-town-city")
        record["State"]    = extract_text(card_body, "span.field--name-field-tx-state-territory span.field__item")
        record["Postcode"] = extract_text(card_body, "span.field--name-field-postcode")
        record["Country"]  = extract_text(card_body, "div.field--name-field-tx-country div.field__item")
        record["Phone"]    = extract_text(card_body, "div.field--name-field-phone div.field__item")
        record["Fax"]      = extract_text(card_body, "div.field--name-field-fax div.field__item")
        
        email_tag = card_body.select_one("div.field--name-field-email a")
        record["Email"] = email_tag["href"].replace("mailto:", "").strip() if email_tag and email_tag.has_attr("href") else ""
        
        website_tag = card_body.select_one("div.field--name-field-website a")
        record["Website"] = website_tag["href"].strip() if website_tag and website_tag.has_attr("href") else ""
        
        service_tags = card_body.select("div.field--name-field-tx-dame-types-services div.field__item")
        record["Services"] = "; ".join([s.get_text(strip=True) for s in service_tags])
        
        records.append(record)
    return records

def main():
    total_pages = get_total_pages()
    if not total_pages:
        print("Unable to determine total pages. Exiting.")
        return
    
    all_records = []
    # Loop through all pages from 1 to total_pages
    for page_num in range(1, total_pages + 1):
        records = scrape_page(page_num)
        if not records:
            print(f"No records found on page {page_num}. Continuing to next page.")
            continue
        all_records.extend(records)
        time.sleep(1)
    
    if all_records:
        headers = [
            "Name", "Updated", "Gender", "Address1", "Address2",
            "Suburb", "State", "Postcode", "Country", "Phone",
            "Fax", "Email", "Website", "Services"
        ]
        with open("aviation_medical_contacts.csv", "w", newline="", encoding="utf-8") as csvfile:
            writer = csv.DictWriter(csvfile, fieldnames=headers)
            writer.writeheader()
            writer.writerows(all_records)
        print(f"Scraping complete. {len(all_records)} records saved to aviation_medical_contacts.csv.")
    else:
        print("No records scraped.")

if __name__ == "__main__":
    main()
    driver.quit()
