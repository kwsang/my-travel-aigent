# Data Model & Market Segments

### Market Segments (Standardized Types)
To ensure consistent reasoning and reporting, the agent follows these standards:

#### Time & Timezone Standards
- **UTC Storage:** All absolute timestamps (e.g., `start_time_utc`) must be stored in ISO 8601 UTC format (`YYYY-MM-DDTHH:MM:SSZ`).
- **IANA Timezone IDs:** Every event must include a `timezone` field using the IANA Timezone Database format (e.g., `America/Los_Angeles`, `Europe/Rome`).
- **Local Time context:** The agent uses `local_start_time` for reasoning about "morning arrivals" or "dinner times" to match human expectations.

#### Market Segments
- `FLIGHT`: Commercial air travel.
- `ACCOMMODATION`: Hotels, resorts, rentals (e.g., Airbnb), or hostels.
- `DINING`: Restaurants, cafes, bars, and food tours.
- `TRANSPORT`: Rental cars, trains, ferries, and local transit.
- `EXPERIENCE`: Guided tours, museum entries, workshops, and attractions.
- `LOGISTICS`: Visas, travel insurance, and airport transfers.

### Scheduling Logic & Constraints
To optimize for the user's "value for money" and "time-saving" goals, the agent follows these block scheduling rules:
1. **Transit Buffers:**
   - **Post-Flight:** Minimum 90-minute buffer after `FLIGHT` arrival for deplaning, baggage, and transit.
   - **Traffic-Aware Commute:** Instead of a static 60 minutes, the agent calculates: `(Estimated Traffic Duration * 1.2) + 10 minutes`.
     - *Peak Hour Adjustment:* Increase multiplier to `1.5` for commutes between 07:30-09:30 and 16:30-18:30 local time.
     - *Minimum Floor:* Never drop below a 20-minute buffer to account for parking/unloading.
2. **Check-in Windows:** 
   - If the user arrives via `FLIGHT` or `TRANSPORT` before 12:00 PM, the agent prioritizes `ACCOMMODATION` with "early check-in" or luggage drop-off capabilities.
3. **Driving vs. Flying:** 
   - If travel time is < 6 hours and arrival is before 12:00 PM, suggest `TRANSPORT` (Driving) to maximize the hotel stay value.
4. **Airport Efficiency:** 
   - Layovers for `FLIGHT` segments must be > 2 hours but < 4 hours to avoid wasting time while ensuring reliability.
5. **Timezone Resilience:**
   - When calculating buffers between segments, the agent must normalize all times to UTC to ensure mathematical accuracy before converting back to local time for the user.
6. **Circadian Personalization:**
   - **Early Bird:** Prioritize starts between 06:00-08:00 local time. Shift `DINING` windows earlier (e.g., Dinner at 17:30).
   - **Night Owl:** Avoid any non-essential segments before 10:00 local time. Prioritize `EXPERIENCE` segments with "nightlife" or "late-night" tags.
7. **Quality vs. Value (Transparency Rule):**
   - If a result is semantically relevant but its rating is below `min_rating`, it must be proposed as a **"Budget Alternative"**.
   - The agent must explicitly flag these items with a "Review Alert" describing the rating discrepancy so the user can decide.

---

### User Profiles Collection
*Purpose: Persistent memory and personalization.*
```json
{
  "user_id": "user_123",
  "preferences": {
    "dietary": ["vegan", "gluten-free"],
    "travel_style": ["luxury", "adventure"],
    "preferred_airlines": ["United", "Lufthansa"],
    "min_rating": 4.5, // Treated as a soft threshold for highlighting vs. budget alternatives.
    "circadian_preference": "night_owl" // Supported values: "early_bird", "night_owl", "standard"
  },
  "home_airport": "SFO",
  "loyalty_programs": { "marriott": "gold" },
  "search_history": ["tuscany", "surfing portugal"]
}
```

---

### Destinations Collection
*Purpose: Semantic discovery via Atlas Vector Search.*
```json
{
  "name": "Ericeira",
  "country": "Portugal",
  "description": "A charming fishing village turned world surfing reserve. Known for consistent waves and cobblestone streets.",
  "description_embedding": [0.12, -0.05, ...], 
  "vibe_tags": ["surfing", "relaxed", "coastal", "authentic"],
  "price_tier": "$$"
}
```

---

### Itineraries Collection
*Purpose: Mission persistence.*
```json
{
  "user_id": "user_123",
  "trip_name": "Summer in Amalfi",
  "status": "draft",
  "events": [
    {
      "segment": "FLIGHT",
      "schedule": {
        "start_time_utc": "2024-07-01T13:00:00Z",
        "end_time_utc": "2024-07-01T21:00:00Z",
        "timezone": "Europe/Rome",
        "local_start_time": "2024-07-01T06:00:00"
      },
      "details": { 
        "from": "SFO", 
        "to": "NAP", 
        "airline": "United"
      }
    },
    {
      "segment": "ACCOMMODATION",
      "schedule": {
        "start_time_utc": "2024-07-01T22:00:00Z",
        "end_time_utc": "2024-07-01T23:00:00Z",
        "timezone": "Europe/Rome",
        "local_start_time": "2024-07-01T11:00:00",
        "note": "Early check-in/Luggage drop-off buffer"
      },
      "details": {
        "name": "Hotel Positano",
        "location": "Positano",
        "type": "Boutique Hotel",
        "rating": 4.8,
        "review_count": 1240
      }
    },
    {
      "segment": "DINING",
      "schedule": {
        "start_time_utc": "2024-07-01T23:00:00Z",
        "end_time_utc": "2024-07-02T00:00:00Z",
        "timezone": "Europe/Rome",
        "local_start_time": "2024-07-01T12:00:00"
      },
      "details": {
        "name": "Lo Guarracino",
        "category": "Lunch",
        "location": "Positano",
        "rating": 4.6,
        "review_count": 890
      }
    },
    {
      "segment": "EXPERIENCE",
      "schedule": {
        "start_time": "2024-07-01T14:00:00",
        "end_time": "2024-07-01T16:00:00",
        "commute_metadata": {
          "estimated_traffic_minutes": 25,
          "applied_buffer_minutes": 40,
          "source": "Google Maps Predictive"
        },
        "note": "Dynamic buffer: 25m traffic + 15m safety margin"
      },
      "details": { 
        "name": "Private Boat Tour", 
        "location": "Amalfi Pier", 
        "category": "Nautical",
        "rating": 4.9,
        "review_count": 312
      }
    }
  ],
  "metadata": {
    "created_at": "ISODate(...)",
    "tags": ["luxury", "coastal"]
  }
}
```