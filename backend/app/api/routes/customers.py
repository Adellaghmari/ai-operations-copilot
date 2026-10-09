from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import db_session
from app.models.entities import Customer
from app.schemas.api import CustomerOut

router = APIRouter(prefix="/customers", tags=["customers"])


@router.get("", response_model=list[CustomerOut])
async def list_customers(session: AsyncSession = Depends(db_session)) -> list[CustomerOut]:
    rows = (await session.execute(select(Customer).order_by(Customer.company))).scalars().all()
    return [CustomerOut.model_validate(row) for row in rows]
