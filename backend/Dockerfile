FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci --ignore-scripts

COPY . .
RUN npm run build


FROM node:20-alpine AS runtime

WORKDIR /app

# Only install production dependencies
COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts

# Copy compiled output
COPY --from=builder /app/dist ./dist

# Create uploads directory (used as fallback when MinIO is not configured)
RUN mkdir -p uploads/avatars uploads/thumbnails

EXPOSE 4000

ENV NODE_ENV=production

CMD ["node", "dist/server.js"]
