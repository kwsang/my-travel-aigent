# Stage 1: Build the application
FROM node:20-alpine AS builder
WORKDIR /app

# Install dependencies first to leverage Docker layer caching
COPY package*.json ./
RUN npm install

COPY . .
# Create public directory if it doesn't exist to prevent COPY failure in the runner stage
RUN mkdir -p public
RUN npm run build

# Stage 2: Production runner
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# Copy necessary build artifacts and configurations
COPY --from=builder /app/next.config.* ./
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

EXPOSE 3000
ENV PORT 3000

# Run the Next.js production server
CMD ["npm", "start"]