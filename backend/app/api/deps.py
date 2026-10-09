from collections.abc import AsyncGenerator

from fastapi import Depends, HTTPException, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings, get_settings
from app.db import get_session
from app.services.quota import new_guest_key


async def db_session() -> AsyncGenerator[AsyncSession, None]:
    async for session in get_session():
        yield session


def settings_dep() -> Settings:
    return get_settings()


def require_private_demo(settings: Settings = Depends(settings_dep)) -> None:
    """Block administrative mutations on the anonymous production demo."""
    if settings.app_env == "production" and settings.demo_public:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This administrative action is disabled on the public demo.",
        )


def enforce_public_ticket_capacity(settings: Settings, current_count: int) -> None:
    """Bound persistent ticket growth while preserving the public recruiter flow."""
    if (
        settings.app_env == "production"
        and settings.demo_public
        and current_count >= settings.demo_max_tickets
    ):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="The public demo ticket capacity has been reached.",
        )


def guest_key(
    request: Request,
    response: Response,
    settings: Settings = Depends(settings_dep),
) -> str:
    cookie_value = request.cookies.get(settings.demo_guest_cookie_name)
    if cookie_value:
        return cookie_value
    value = new_guest_key()
    response.set_cookie(
        settings.demo_guest_cookie_name,
        value,
        httponly=True,
        secure=settings.app_env == "production",
        samesite="lax",
        max_age=86_400,
        path="/",
    )
    return value
