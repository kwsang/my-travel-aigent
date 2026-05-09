# Data Model & Market Segments

### Market Segments (Standardized Types)
To ensure consistent reasoning and reporting, the agent will use the following segments:
- `FLIGHT`: Commercial air travel.
- `ACCOMMODATION`: Hotels, resorts, rentals (e.g., Airbnb), or hostels.
- `DINING`: Restaurants, cafes, bars, and food tours.
- `TRANSPORT`: Rental cars, trains, ferries, and local transit.
- `EXPERIENCE`: Guided tours, museum entries, workshops, and attractions.
- `LOGISTICS`: Visas, travel insurance, and airport transfers.

---

### User Profiles Collection
*Purpose: Persistent memory and personalization.*
```json
{
  "user_id": "user_123",
  "preferences": {
    "dietary": ["vegan", "gluten-free"],
    "travel_style": ["luxury", "adventure"],
    "preferred_airlines": ["United", "Lufthansa"]
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
      "details": { 
        "from": "SFO", 
        "to": "NAP", 
        "date": "2024-07-01",
        "airline": "United"
      }
    },
    {
      "segment": "EXPERIENCE",
      "details": { 
        "name": "Private Boat Tour", 
        "location": "Positano", 
        "category": "Nautical" 
      }
    }
  ],
  "metadata": {
    "created_at": "ISODate(...)",
    "tags": ["luxury", "coastal"]
  }
}
```

**Navigation:**
- [Main Implementation Plan](IMPLEMENTATION_PLAN.md)
- [Implementation Phases](PHASES.md)
- [Why MongoDB?](WHY_MONGODB.md)