# syntax=docker/dockerfile:1
FROM python:3.12.14-slim-bookworm AS build
WORKDIR /build
RUN apt-get update && apt-get install -y --no-install-recommends patch && rm -rf /var/lib/apt/lists/*
RUN --mount=type=secret,id=proxy_ca \
    if [ -f /run/secrets/proxy_ca ]; then export SSL_CERT_FILE=/run/secrets/proxy_ca; fi; \
    python -c "import urllib.request; urllib.request.urlretrieve('https://codeload.github.com/wwiens/trakt_mcpserver/tar.gz/cd491444be86dbc219d77dc652f75432d7f3af57','source.tar.gz')"
RUN mkdir source && tar -xzf source.tar.gz --strip-components=1 -C source
COPY patches/trakt-mcp-sdk2.patch /build/sdk2.patch
RUN cd source && patch -p1 --fuzz=0 < /build/sdk2.patch
COPY container/requirements.txt /build/requirements.txt
RUN --mount=type=secret,id=proxy_ca \
    if [ -f /run/secrets/proxy_ca ]; then export PIP_CERT=/run/secrets/proxy_ca; fi; \
    pip install --no-cache-dir --prefix=/install -r requirements.txt && \
    pip install --no-cache-dir --prefix=/install --no-deps ./source

FROM python:3.12.14-slim-bookworm
COPY --from=build /install /usr/local
WORKDIR /app
COPY --chmod=644 container/main.py container/token_store.py ./
COPY --chmod=644 container/LICENSE.trakt-mcp /usr/share/doc/trakt-mcp/LICENSE
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1
USER 65532:65532
EXPOSE 8080
CMD ["python", "/app/main.py"]
