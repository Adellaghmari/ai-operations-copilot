from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field
from sqlalchemy import Select, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.entities import Customer, KnowledgeChunk, KnowledgeDocument, Ticket


class ToolResult(BaseModel):
    name: str
    ok: bool
    data: Any
    error: str | None = None


class SearchKnowledgeArgs(BaseModel):
    query: str = Field(min_length=2, max_length=400)
    limit: int = Field(default=5, ge=1, le=8)


class TicketIdArgs(BaseModel):
    ticket_id: str


class CustomerIdArgs(BaseModel):
    customer_id: str


async def search_knowledge(session: AsyncSession, args: SearchKnowledgeArgs) -> ToolResult:
    statement: Select[tuple[KnowledgeChunk, KnowledgeDocument]] = (
        select(KnowledgeChunk, KnowledgeDocument)
        .join(KnowledgeDocument)
        .where(KnowledgeDocument.visibility == "standard")
        .where(KnowledgeChunk.body.ilike(f"%{args.query}%"))
        .limit(args.limit)
    )
    rows = (await session.execute(statement)).all()
    data = [
        {
            "chunk_id": str(chunk.id),
            "document_name": document.title,
            "section": chunk.section,
            "snippet": chunk.body[:400],
        }
        for chunk, document in rows
    ]
    return ToolResult(name="search_knowledge", ok=True, data=data)


async def get_ticket_history(session: AsyncSession, args: TicketIdArgs) -> ToolResult:
    ticket = await session.get(Ticket, UUID(args.ticket_id), options=[selectinload(Ticket.messages)])
    if ticket is None:
        return ToolResult(name="get_ticket_history", ok=False, data=None, error="Ticket not found")
    data = [
        {"author": message.author_name, "body": message.body[:500], "created_at": message.created_at.isoformat()}
        for message in ticket.messages
    ]
    return ToolResult(name="get_ticket_history", ok=True, data=data[:20])


async def get_customer_context(session: AsyncSession, args: CustomerIdArgs) -> ToolResult:
    customer = await session.get(Customer, UUID(args.customer_id))
    if customer is None:
        return ToolResult(name="get_customer_context", ok=False, data=None, error="Customer not found")
    return ToolResult(
        name="get_customer_context",
        ok=True,
        data={
            "name": customer.name,
            "company": customer.company,
            "plan": customer.plan,
            "region": customer.region,
            "notes": customer.notes,
        },
    )


async def get_similar_resolved_tickets(session: AsyncSession, query: str, limit: int = 5) -> ToolResult:
    statement = (
        select(Ticket)
        .where(Ticket.status.in_(["resolved", "closed"]))
        .where(Ticket.body.ilike(f"%{query.split()[0] if query else 'support'}%"))
        .limit(limit)
    )
    tickets = (await session.execute(statement)).scalars().all()
    data = [
        {"display_id": ticket.display_id, "subject": ticket.subject, "category": ticket.category}
        for ticket in tickets
    ]
    return ToolResult(name="get_similar_resolved_tickets", ok=True, data=data)
