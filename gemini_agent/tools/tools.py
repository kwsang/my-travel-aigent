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