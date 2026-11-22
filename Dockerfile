# DM Forge V3 server: the app plus the notes database server, in one small image.
#   docker compose up -d --build        (see deploy/DEPLOY-V3.md)
FROM node:22-slim AS build
WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci
COPY build.mjs VERSION ./
COPY src ./src
RUN node build.mjs

FROM python:3.12-slim
WORKDIR /app
COPY server/dmforge_db.py server/dmforge_hosted.py server/dmforge_io.py server/sw.js ./
COPY --from=build /src/dist/DM-Forge.html ./DM-Forge.html
COPY VERSION ./VERSION
ENV DMFORGE_DATA=/data \
    DMFORGE_APP=/app/DM-Forge.html \
    DMFORGE_BIND=0.0.0.0 \
    DMFORGE_PORT=8765 \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1
RUN mkdir -p /data /export && chmod 777 /data /export
VOLUME ["/data", "/export"]
EXPOSE 8765
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD python -c "import urllib.request;urllib.request.urlopen('http://127.0.0.1:8765/healthz',timeout=4)"
CMD ["python", "-I", "dmforge_hosted.py"]
