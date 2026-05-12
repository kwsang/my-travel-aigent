import os
from gemini_agent.clients import MONGODB_URI

# App Metadata
APP_TITLE = "My Travel Aigent API"
APP_VERSION = "1.0.0"

# Database Settings
MONGODB_URL = MONGODB_URI
DATABASE_NAME = "my-travel-aigent"
SESSION_DATABASE_NAME = "my_travel_aigent_sessions"
SESSION_COLLECTION = "sessions"
SESSION_TTL_SECONDS = 2592000  # 30 days

# CORS Configuration
FRONTEND_URL_ENV = os.getenv("FRONTEND_URL", "http://localhost:3000")
FRONTEND_URLS = [url.strip() for url in FRONTEND_URL_ENV.split(",") if url.strip()]

# Add variations and common defaults for local development
ALLOWED_ORIGINS = list(set(
    [url.rstrip('/') for url in FRONTEND_URLS] + 
    [f"{url.rstrip('/')}/" for url in FRONTEND_URLS] + 
    ["http://localhost:3000", "http://127.0.0.1:3000", "http://localhost:3001"]
))

# Handle dynamic Cloud Run frontend URLs
ALLOWED_ORIGIN_REGEX = r"https://travel-aigent-web-.*\.run\.app"