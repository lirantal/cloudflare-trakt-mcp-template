"""No-network regression checks for ephemeral-process token restoration."""
import json
import os
import unittest
from unittest.mock import patch
from urllib.error import URLError

from token_store import install
install()
from client.auth import token_store
from models.auth import TraktAuthToken


class Response:
    def __init__(self, body): self.body = body
    def __enter__(self): return self
    def __exit__(self, *args): pass
    def read(self, maximum): return self.body[:maximum]


class DurableStoreTests(unittest.TestCase):
    def setUp(self):
        self.pair = None
        self.failure = False
        self.env = patch.dict(os.environ, {'TRAKT_TOKEN_STORE_URL':'https://owner.example/internal/trakt-token','TRAKT_TOKEN_STORE_KEY':'dummy-key'})
        self.env.start()
        self.opener = patch('urllib.request.build_opener')
        self.opener.start().return_value.open.side_effect = self.open

    def tearDown(self):
        self.opener.stop()
        self.env.stop()

    def open(self, request, timeout):
        if self.failure: raise URLError('simulated failure')
        self.assertEqual(request.get_header('Authorization'),'Bearer dummy-key')
        if request.method == 'PUT': self.pair = json.loads(request.data)
        if request.method == 'DELETE': self.pair = None
        return Response(json.dumps(self.pair).encode())

    def test_restores_rotated_pair_in_new_store_and_disconnects(self):
        first=token_store.TokenStore('/unused')
        for value in ['initial','rotated']:
            first.save(TraktAuthToken(access_token=value,refresh_token=value+'-refresh',created_at=123,expires_in=3600))
        second=token_store.TokenStore('/unused')
        second.sync_from_disk()
        self.assertEqual(second.token.access_token,'rotated')
        self.assertTrue(second.clear())
        first.sync_from_disk()
        self.assertIsNone(first.token)

    def test_storage_failure_never_reports_success(self):
        store=token_store.TokenStore('/unused')
        self.failure=True
        with self.assertRaisesRegex(RuntimeError,'Durable token storage unavailable'):
            store.save(TraktAuthToken(access_token='dummy',refresh_token='dummy',created_at=123,expires_in=3600))
        self.assertIsNone(store.token)


if __name__ == '__main__': unittest.main()
