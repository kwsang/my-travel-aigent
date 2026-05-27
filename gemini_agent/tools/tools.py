"""
Aggregator for travel tools. 
Exposes tools modularized into domain-specific files.
"""

from .user_management import (
    record_user_profile,
    query_user_profile
)
from .discovery import (
    search_destinations,
    discover_new_destination,
    save_destination_lodging,
    save_destination_activities,
    get_cached_lodging,
    get_cached_activities,
    vector_search_places
)

# Placeholder for itinerary and geo tools (to be implemented similarly)
from .itinerary_tools import save_itinerary, get_itinerary, list_trip_versions, delete_itinerary, update_itinerary_status, clone_itinerary, finalize_itinerary
from .geo_tools import google_maps_matrix, search_places, search_local_events

# Phase 1: State Management & Scratchpad Tools
from .phase1_state_tools import (
    read_draft_itinerary,
    calculate_budget,
    save_to_scratchpad,
    get_top_items_from_scratchpad
)

# Phase 2: Geospatial Caching Tools
from .phase2_geo_tools import (
    save_places_to_cache,
    find_nearby_cached_places
)

# Phase 3: Memory and Semantic Caching
from .phase3_memory_tools import (
    cache_successful_itinerary,
    search_past_itineraries
)

# Phase 4: Schema-less JIT Payload Normalization
from .phase4_schema_tools import (
    query_raw_place_data
)