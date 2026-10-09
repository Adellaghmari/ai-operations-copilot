from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import func, select
from starlette.responses import Response

from app.ai.observability import configure_observability, instrument_fastapi_app
from app.api.routes import (
    ai_runs,
    customers,
    dashboard,
    demo,
    evaluations,
    health,
    knowledge,
    tickets,
)
from app.config import get_settings
from app.db import AsyncSessionLocal, create_schema
from app.models.entities import Customer
from app.security import add_browser_security_headers


@asynccontextmanager
async def lifespan(_: FastAPI):
    settings = get_settings()
    configure_observability(settings)
    if settings.app_env != "production":
        await create_schema()
        async with AsyncSessionLocal() as session:
            count = (await session.execute(select(func.count(Customer.id)))).scalar_one()
            if count == 0:
                from scripts.seed import seed_database

                await seed_database(session, settings, reset_synthetic=False)
    yield


def create_app() -> FastAPI:
    settings = get_settings()
    configure_observability(settings)
    application = FastAPI(
        title=settings.app_name,
        description="Evidence grounded AI decision assurance for human reviewed operational decisions.",
        lifespan=lifespan,
    )
    application.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["*"],
    )

    @application.middleware("http")
    async def security_headers(request: Request, call_next) -> Response:
        response = await call_next(request)
        return add_browser_security_headers(response)

    prefix = settings.api_prefix
    application.include_router(health.router, prefix=prefix)
    application.include_router(dashboard.router, prefix=prefix)
    application.include_router(tickets.router, prefix=prefix)
    application.include_router(customers.router, prefix=prefix)
    application.include_router(knowledge.router, prefix=prefix)
    application.include_router(ai_runs.router, prefix=prefix)
    application.include_router(evaluations.router, prefix=prefix)
    application.include_router(demo.router, prefix=prefix)
    instrument_fastapi_app(application)
    return application


app = create_app()
