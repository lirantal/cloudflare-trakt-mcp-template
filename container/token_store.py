"""Persist the upstream token pair in the owner's Durable Object, not disk."""
import os
import urllib.request
from contextlib import asynccontextmanager
import asyncio
import json


def install():
    from client.auth import token_store
    from models.auth import TraktAuthToken

    class DurableTokenStore(token_store.TokenStore):
        def __init__(self, path):
            super().__init__(path)
            self.lock = asyncio.Lock()

        def request(self, method, token=None):
            url = os.environ['TRAKT_TOKEN_STORE_URL']
            if not url.startswith('https://'):
                raise RuntimeError('Durable token storage requires HTTPS')
            request = urllib.request.Request(url, method=method,
                data=token.model_dump_json().encode() if token else None,
                headers={'Authorization': 'Bearer '+os.environ['TRAKT_TOKEN_STORE_KEY'],
                         'Content-Type': 'application/json'})
            # Never follow a redirect carrying the bridge credential.
            class NoRedirect(urllib.request.HTTPRedirectHandler):
                def redirect_request(self, *args, **kwargs):
                    return None
            try:
                with urllib.request.build_opener(NoRedirect).open(request, timeout=15) as response:
                    return response.read(16385)
            except Exception:
                # Do not expose a token, URL, or credential in an exception.
                raise RuntimeError('Durable token storage unavailable') from None

        def sync_from_disk(self):
            raw = self.request('GET')
            decoded = json.loads(raw)
            self.token = None if decoded is None else TraktAuthToken.model_validate(decoded)

        def save(self, token):
            # A failed durable write is an error, never silent memory-only success.
            self.request('PUT', token)
            self.token = token

        def clear(self):
            had_token = self.token is not None
            self.request('DELETE')
            self.token = None
            return had_token

        @asynccontextmanager
        async def refresh_lock(self):
            async with self.lock:
                yield

    token_store.TokenStore = DurableTokenStore

