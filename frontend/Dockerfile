# ── Build ─────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS build
WORKDIR /build

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Vite resolves import.meta.env at build time, so the backend address is fixed into the
# bundle here rather than read at runtime. Changing it means rebuilding this image.
ARG VITE_API_URL=http://localhost:8279
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

# ── Runtime ───────────────────────────────────────────────────────────────────
FROM nginx:1.27-alpine

COPY --from=build /build/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
