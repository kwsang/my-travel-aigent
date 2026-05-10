# Stage 1: Build stage
FROM python:3.12-slim AS builder

RUN apt-get update && apt-get install -y \
    build-essential \
    libgeos-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /build

# Copy dependency definitions from the build context (project root)
COPY pyproject.toml .
COPY gemini_agent ./gemini_agent

# Generate wheels for all dependencies listed in pyproject.toml
RUN pip wheel --no-cache-dir --wheel-dir /build/wheels .

# Stage 2: Final runtime stage
FROM python:3.12-slim

# Install ONLY the runtime shared library for GEOS
RUN apt-get update && apt-get install -y \
    libgeos-c1v5 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=builder /build/wheels /wheels
# Install the generated wheels (this includes motor and google-adk)
RUN pip install --no-cache-dir /wheels/*.whl

# Copy the rest of the application code
COPY . .
EXPOSE 8000
CMD ["sh", "-c", "uvicorn server:app --host 0.0.0.0 --port ${PORT:-8000}"]