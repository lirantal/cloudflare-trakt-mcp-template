"""Cloudflare transport and explicit, fail-closed tool catalog for pinned upstream."""
import asyncio
import logging
import os

from token_store import install

# Upstream logs may include identifiers or API errors. Disable application logs.
logging.disable(logging.CRITICAL)
install()  # before importing AuthClient / creating any shared stores

from server.main import mcp
from mcp.types import ToolAnnotations

READ_TOOLS = frozenset('''
search_shows search_movies fetch_trending_shows fetch_popular_shows
fetch_anticipated_shows fetch_show_summary fetch_show_ratings fetch_related_shows
fetch_show_seasons fetch_season_info fetch_season_episodes fetch_episode_summary
fetch_trending_movies fetch_popular_movies fetch_movie_summary fetch_movie_ratings
fetch_related_movies fetch_user_watched_shows fetch_user_watched_movies
fetch_show_progress fetch_playback_progress fetch_history fetch_user_ratings
fetch_user_watchlist fetch_show_recommendations fetch_movie_recommendations
'''.split())
AUTH_TOOLS = frozenset(['start_device_auth','check_auth_status','clear_auth'])
WRITE_TOOLS = frozenset(['add_to_history','add_user_watchlist','add_user_ratings'])


async def configure():
    mode = os.environ.get('TRAKT_ACCESS_MODE', 'read-only')
    if mode not in ('read-only', 'track'):
        raise RuntimeError('Invalid access mode')
    allowed = READ_TOOLS | AUTH_TOOLS | (WRITE_TOOLS if mode == 'track' else frozenset())
    tools = await mcp.list_tools()
    found = {tool.name for tool in tools}
    if not allowed <= found:
        raise RuntimeError('Pinned upstream tool catalog changed')
    for tool in tools:
        if tool.name not in allowed:
            mcp.remove_tool(tool.name)
        else:
            # Annotations describe actual enforced registration, not a security gate.
            registered = mcp._tool_manager.get_tool(tool.name)
            registered.annotations = ToolAnnotations(
                readOnlyHint=tool.name in READ_TOOLS,
                destructiveHint=tool.name not in READ_TOOLS,
                idempotentHint=tool.name in READ_TOOLS,
                openWorldHint=True,
            )


if __name__ == '__main__':
    asyncio.run(configure())
    mcp.run(transport='streamable-http',host='0.0.0.0',port=8080,
            stateless_http=True,json_response=True)
