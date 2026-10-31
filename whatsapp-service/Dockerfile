FROM node:20-bookworm-slim
WORKDIR /service

# whatsapp-web.js drives a real browser: there is no WhatsApp API to call, so Chromium
# is a runtime dependency rather than a build tool. The distribution's build is used
# instead of the one Puppeteer downloads — it comes with the shared libraries already
# resolved, which the bundled build does not on a slim image.
ENV PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
# ffmpeg перепаковує голосові з webm у OGG/Opus — тільки в цьому контейнері
# WhatsApp показує їх голосовими, а не вкладеним аудіофайлом.
RUN apt-get update && apt-get install --no-install-recommends -y \
        chromium \
        ffmpeg \
        fonts-liberation \
        ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY main.js ./

# whatsapp-web.js writes its logged-in sessions under .wwebjs_auth. Without a volume
# mounted here every restart would send the user back to scanning a QR code.
RUN mkdir -p /service/.wwebjs_auth && chown -R node:node /service
USER node

EXPOSE 8204

CMD ["node", "main.js"]
