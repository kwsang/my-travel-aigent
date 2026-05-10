# Use a slim Python image to keep the container lightweight
FROM python:3.12-slim

# Install system dependencies required for geospatial libraries like Shapely
RUN apt-get update && apt-get install -y \
    libgeos-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy requirements first to leverage Docker layer caching
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the agent source code
COPY . .

# Cloud Run automatically assigns a port and provides it via the PORT env var.
# We use 'server:app' because server.py contains the FastAPI 'app' instance.
EXPOSE 8000
CMD uvicorn server:app --host 0.0.0.0 --port $PORT