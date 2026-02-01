# ============================================
# CEA Agent Server - Production Dockerfile
# ============================================

# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (including dev)
RUN npm ci

# Copy source code
COPY tsconfig.json ./
COPY src ./src

# Build TypeScript
RUN npm run build

# ============================================
# Production stage
# ============================================
FROM node:20-alpine AS production

WORKDIR /app

# ffmpeg para convertir notas de voz (opus/ogg) a mp3 para Whisper
RUN apk add --no-cache ffmpeg

# Add non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Copy package files and install production dependencies only
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy built files from builder stage
COPY --from=builder /app/dist ./dist

# Set ownership to non-root user
RUN chown -R nodejs:nodejs /app

# Switch to non-root user
USER nodejs

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

# Start server
CMD ["node", "dist/server.js"]
