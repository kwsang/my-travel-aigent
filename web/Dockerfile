# Stage 1: Build
FROM node:20-alpine AS builder
WORKDIR /app

# Install dependencies first to leverage Docker layer caching
COPY package*.json ./
RUN npm install

# Copy the rest of the source code (filtered by .dockerignore)
COPY . .

RUN mkdir -p public

ENV NEXT_TELEMETRY_DISABLED 1

RUN npm run build

# Stage 2: Runner
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED 1

# Copy necessary build artifacts and configurations
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

EXPOSE 3000
ENV PORT 3000
ENV HOSTNAME "0.0.0.0"

# Run the standalone server directly
CMD ["node", "server.js"]