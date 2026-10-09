from collections.abc import AsyncGenerator

from fastapi import Cookie, Depends, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings, get_settings
from app.db import get_session
from app.services.quota import new_guest_key


async def db_session() -> AsyncGenerator[AsyncSession, None]:
    async for session in get_session():
        yield session


def settings_dep() -> Settings:
    return get_settings()


def guest_key(
    response: Response,
    settings: Settings = Depends(settings_dep),
    cookie_value: str | None = Cookie(default=None, alias="aoc_demo_guest"),
) -> str:
    if cookie_value:
        return cookie_value
    value = new_guest_key()
    response.set_cookie(settings.demo_guest_cookie_name, value, httponly=True, samesite="lax")
    return value
