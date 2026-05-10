# Stage 1: Build stage
FROM python:3.12-slim AS builder

RUN apt-get update && apt-get install -y \
    build-essential \
    libgeos-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /build

# 1. Copy ONLY the dependency list from the package folder.
# This layer stays cached unless you change your requirements.
COPY gemini_agent/requirements.txt .

# 2. Use BuildKit cache mounts to reuse the pip cache across builds.
# This is the secret to stopping "downloading every time".
RUN --mount=type=cache,target=/root/.cache/pip \
    pip wheel --wheel-dir /build/wheels -r requirements.txt

# 3. Copy package metadata and source code to build the local wheel.
COPY pyproject.toml .
COPY gemini_agent ./gemini_agent
RUN pip wheel --no-cache-dir --no-deps --wheel-dir /build/wheels .

# Stage 2: Final runtime stage
FROM python:3.12-slim

# Install ONLY the runtime shared library for GEOS
RUN apt-get update && apt-get install -y \
    libgeos-c1v5 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=builder /build/wheels /wheels
RUN pip install --no-cache-dir /wheels/*

COPY . .
EXPOSE 8000
CMD ["sh", "-c", "uvicorn server:app --host 0.0.0.0 --port ${PORT:-8000}"]