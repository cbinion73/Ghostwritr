FROM node:22-slim

# Install OpenSSL for Prisma; zip/unzip for Publish Package export and book
# archive import/export; pandoc for HTML->DOCX conversion. All three were
# confirmed missing in production — several export routes were written
# against macOS's `textutil` and the assumption that `zip`/`unzip` exist,
# neither of which node:22-slim provides, so every docx/zip export was
# silently failing (or producing empty output) with no error surfaced.
RUN apt-get update -y && apt-get install -y openssl zip unzip pandoc && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --legacy-peer-deps

# Copy source (excluding .env so docker-compose env_file takes precedence)
COPY . .
RUN rm -f .env

# Generate Prisma client
RUN npx prisma generate

# Build Next.js
RUN npm run build

EXPOSE 3000

CMD ["npm", "start"]
