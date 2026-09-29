# Production Deployment Guide

Pulse is architected for bare-metal, virtual private server (VPS), Docker Swarm, and Kubernetes environments.

## Quickstart with Docker Compose

```bash
# Clone the repository
git clone https://github.com/organization/pulse-chat.git
cd pulse-chat

# Copy environment template and adjust secrets
cp .env.example .env
nano .env

# Build and start all services
docker compose up -d --build

# Verify container health
docker compose ps
curl http://localhost:3000/api/health
```

## Production Checklist

1. **Environment Variables**:
   - Ensure `SESSION_SECRET` is at least 32 cryptographically random bytes.
   - Point `DATABASE_URL` to your high-availability PostgreSQL cluster.
   - Provide external S3/MinIO credentials for durable object storage.
2. **Reverse Proxy (Nginx / Traefik / Caddy)**:
   - Enforce HTTPS / TLS 1.3 certificates (e.g. Let's Encrypt).
   - Configure WebSocket upgrade headers (`Upgrade $http_upgrade`, `Connection "upgrade"`).
   - Set client body limit to `50M` for voice notes and media uploads.
3. **Database Migrations**:
   - Run `npx prisma migrate deploy` prior to rolling out new versions.
4. **Disaster Recovery**:
   - Schedule automated `pg_dump` backups of the PostgreSQL volume.
