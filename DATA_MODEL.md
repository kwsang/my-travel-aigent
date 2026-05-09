# Data Model & Market Segments

### Market Segments (Standardized Types)
To ensure consistent reasoning and reporting, the agent follows these standards:

#### Time & Timezone Standards
- **UTC Storage:** All absolute timestamps (e.g., `start_time_utc`) must be stored in ISO 8601 UTC format (`YYYY-MM-DDTHH:MM:SSZ`).
- **Geospatial Standards:** Locations should include a `geo` object following GeoJSON standards: `{ "type": "Point", "coordinates": [longitude, latitude] }`.
- **IANA Timezone IDs:** Every event must include a `timezone` field using the IANA Timezone Database format (e.g., `America/Los_Angeles`, `Europe/Rome`).
- **Local Time context:** The agent uses `local_start_time` for reasoning about "morning arrivals" or "dinner times" to match human expectations.

#### Price & Currency Standards
- **ISO 4217 Currency:** All prices must specify a 3-letter currency code (e.g., `USD`, `EUR`).
- **Price Object:** Every cost-bearing detail should use the structure: `{ "amount": float, "currency": "ISO_CODE", "is_estimated": boolean }`.

#### Metadata Standards
- **Itinerary Duration:** The root itinerary must include `duration_days` representing the total length of the trip.
- **ACCOMMODATION Metadata:** Must include `stay_duration_nights`, `property_type` (e.g., Hotel, House Rental), `beds` (count), `amenities` (list), and `policies` for early check-in/checkout.
- **TRANSPORT Metadata:** Must include `vehicle_type`, `vehicle_count`, and `provider`.

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
5. **Buffer Overrun Protocol:**
   - If `Estimated Traffic Duration` from API exceeds the `applied_buffer_minutes`:
     - **Auto-Correction:** Set new buffer to `Estimated Traffic Duration + 15 minutes` (Safety Margin).
     - **Conflict Flag:** Mark the subsequent event with `status: "time_conflict"` if the new buffer creates an overlap.
6. **Timezone Resilience:**
   - When calculating buffers between segments, the agent must normalize all times to UTC to ensure mathematical accuracy before converting back to local time for the user.
7. **Circadian Personalization:**
   - **Early Bird:** Prioritize starts between 06:00-08:00 local time. Shift `DINING` windows earlier (e.g., Dinner at 17:30).
   - **Night Owl:** Avoid any non-essential segments before 10:00 local time. Prioritize `EXPERIENCE` segments with "nightlife" or "late-night" tags.
8. **Budget Adherence & Scaling:**
   - The agent must maintain a running total of the itinerary cost.
   - For `DINING` and `EXPERIENCE` segments, the agent must scale per-person price estimates by the total `party_size` (adults + children).
   - If the total exceeds the `budget_limit` in the `UserProfile`, the agent must prioritize finding "Budget Alternatives" for the remaining unbooked segments.
      - **Per-Person Toggle:** If `group_planning_per_person` is enabled, the budget limit comparison and final reporting must be calculated as `Total Cost / Total People`.
   - **Room Sharing:** When `room_sharing` is enabled, calculate the number of rooms needed (Total People / `people_per_room`, rounded up) and multiply by the per-room price before dividing by the total party size for the per-person estimate.
9. **Quality vs. Value (Transparency Rule):**
   - If a result is semantically relevant but its rating is below `min_rating`, it must be proposed as a **"Budget Alternative"**.
   - The agent must explicitly flag these items with a "Review Alert" describing the rating discrepancy so the user can decide.
10. **Risk Tolerance:**
   - **Relaxed:** Plan by "Days" rather than linear events. Cluster activities within a single geographic area per day to minimize travel. Include a mandatory "Retreat to Hotel" block after primary daily activities.
   - **Comfort Buffers (Relaxed):** Add 15 minutes to all calculated transit buffers and enforce a 40-minute Minimum Floor.
   - **Strict:** Prioritize efficiency by using the calculated buffers with no additional padding (minimizing dead time).

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
    "circadian_preference": "night_owl", // Supported values: "early_bird", "night_owl", "standard"
    "risk_tolerance": "relaxed", // Supported values: "relaxed", "strict"
    "group_planning_per_person": true,
    "room_sharing": true,
    "people_per_room": 2,
    "budget": {
      "total_limit": 5000,
      "currency": "USD"
    },
    "party_size": {
      "adults": 2,
      "children": 2
    }
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
  "location": {
    "type": "Point",
    "coordinates": [-9.4185, 38.9633]
  },
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
  "duration_days": 7,
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
        "origin_geo": { "type": "Point", "coordinates": [-122.3748, 37.6188] },
        "to": "NAP", 
        "destination_geo": { "type": "Point", "coordinates": [14.2908, 40.8860] },
        "airline": "United",
        "price": { "amount": 2400.00, "currency": "USD", "is_estimated": false }
      }
    },
    {
      "segment": "TRANSPORT",
      "schedule": {
        "start_time_utc": "2024-07-01T21:15:00Z",
        "end_time_utc": "2024-07-01T21:45:00Z",
        "timezone": "Europe/Rome",
        "local_start_time": "2024-07-01T23:15:00"
      },
      "details": {
        "vehicle_type": "Private Van",
        "vehicle_count": 2,
        "provider": "Amalfi Transfers",
        "from": "NAP Airport",
        "to": "Hotel Positano",
        "price": { "amount": 200.00, "currency": "EUR", "is_estimated": true }
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
        "geo": {
          "type": "Point",
          "coordinates": [14.4840, 40.6280]
        },
        "stay_duration_nights": 4,
        "property_type": "Hotel",
        "beds": 2,
        "amenities": ["pool", "wifi", "terrace", "gym"],
        "policies": {
          "early_checkin_available": true,
          "early_checkout_available": true
        },
        "type": "Boutique Hotel",
        "rating": 4.8,
        "review_count": 1240,
        "price": { "amount": 900.00, "currency": "EUR", "is_estimated": true }
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
        "geo": {
          "type": "Point",
          "coordinates": [14.4850, 40.6270]
        },
        "price": { "amount": 150.00, "currency": "EUR", "is_estimated": true },
        "rating": 4.6,
        "review_count": 890
      }
    },
    {
      "segment": "EXPERIENCE",
      "schedule": {
        "start_time_utc": "2024-07-02T12:00:00Z",
        "end_time_utc": "2024-07-02T14:00:00Z",
        "timezone": "Europe/Rome",
        "local_start_time": "2024-07-02T14:00:00",
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
        "geo": {
          "type": "Point",
          "coordinates": [14.6020, 40.6330]
        },
        "category": "Nautical",
        "rating": 4.9,
        "review_count": 312,
        "price": { "amount": 450.00, "currency": "EUR", "is_estimated": false }
      }
    }
  ],
  "metadata": {
    "created_at": "ISODate(...)",
    "tags": ["luxury", "coastal"],
    "total_estimated_cost": { "amount": 4050.00, "currency": "USD" }
  }
}
```