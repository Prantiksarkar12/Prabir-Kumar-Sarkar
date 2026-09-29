# Production Multi-Stage Dockerfile for Pulse Chat Platform
# Stage 1: Build Frontend Assets
FROM node:22-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Stage 2: Production Runtime
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

COPY package*.json ./
RUN npm ci --only=production

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server ./server
COPY --from=builder /app/server.ts ./server.ts
COPY --from=builder /app/src/types ./src/types
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/tsconfig.json ./tsconfig.json

# Persistent directories
RUN mkdir -p /app/data/pulse_pg /app/data/uploads

EXPOSE 3000

CMD ["npx", "tsx", "server.ts"]
