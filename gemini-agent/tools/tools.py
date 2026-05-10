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
    discover_new_destination
)

# Placeholder for itinerary and geo tools (to be implemented similarly)
from .itinerary_tools import save_itinerary
from .geo_tools import google_maps_matrix, google_places_details, search_places, search_local_events