"""No-network regression checks for ephemeral-process token restoration."""
import json
import os
import unittest
from unittest.mock import patch
from urllib.error import URLError
from urllib.error import HTTPError
from io import BytesIO

from token_store import install
install()
from client.auth import token_store
from models.auth import TraktAuthToken
from mcp.server.mcpserver.exceptions import ToolError


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
        self.assertEqual(request.get_header('User-agent'),'trakt-cloudflare-mcp/token-store')
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
        with self.assertRaisesRegex(ToolError,'Durable token storage: network unavailable'):
            store.save(TraktAuthToken(access_token='dummy',refresh_token='dummy',created_at=123,expires_in=3600))
        self.assertIsNone(store.token)

    def test_edge_rejection_exposes_only_status_and_known_classification(self):
        store=token_store.TokenStore('/unused')
        with patch('urllib.request.build_opener') as opener:
            opener.return_value.open.side_effect=HTTPError('https://private.invalid',403,'private reason',
                {'cf-mitigated':'challenge'},BytesIO(b'private body and identifiers'))
            with self.assertRaises(ToolError) as caught: store.sync_from_disk()
        self.assertEqual(str(caught.exception),'Durable token storage returned HTTP 403 (edge challenge)')


class AuthToolTests(unittest.IsolatedAsyncioTestCase):
    async def test_real_sdk_executes_auth_status_without_an_existing_trakt_grant(self):
        # Exercise the registered tool, not only discovery or the storage class.
        import main
        await main.configure()
        with patch.dict(os.environ,{'TRAKT_CLIENT_ID':'dummy-no-real-access'}), patch.object(token_store.TokenStore,'request',return_value=b'null'):
            result=await main.mcp.call_tool('check_auth_status',{})
        self.assertFalse(result.is_error)
        self.assertIn('No active authentication flow',result.content[0].text)


if __name__ == '__main__': unittest.main()
