FROM node:22-alpine

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
ENV DATABASE_PATH=/app/data/wabot.db
ENV NODE_ENV=production

RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    font-noto-emoji \
    python3 \
    make \
    g++

RUN if [ -x /usr/bin/chromium ] && [ ! -e /usr/bin/chromium-browser ]; then ln -sf /usr/bin/chromium /usr/bin/chromium-browser; fi \
    && if [ -x /usr/bin/chromium-browser ] && [ ! -e /usr/bin/chromium ]; then ln -sf /usr/bin/chromium-browser /usr/bin/chromium; fi

WORKDIR /app

COPY package*.json ./

RUN npm ci --include=dev

COPY . .

RUN npm run build

RUN mkdir -p /app/data

CMD ["node", "dist/main.js"]
