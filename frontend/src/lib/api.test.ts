import { ApiError, api } from "./api";
import { installMockApi } from "../test/mockApi";

describe("api error mapping", () => {
  let restore: () => void = () => undefined;
  afterEach(() => restore());

  it("turns a FastAPI validation list into one readable sentence", async () => {
    ({ restore } = installMockApi([
      {
        match: "/api/tickets/not-a-uuid",
        status: 422,
        body: JSON.stringify({ detail: [{ type: "uuid_parsing", loc: ["path", "ticket_id"], msg: "Input should be a valid UUID" }] }),
      },
    ]));
    const failure = await api.ticket("not-a-uuid").catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(ApiError);
    expect((failure as ApiError).status).toBe(422);
    expect((failure as ApiError).message).toBe("The request was rejected because a value was not valid.");
    expect((failure as ApiError).message).not.toContain("uuid_parsing");
  });

  it("uses a string detail as is", async () => {
    ({ restore } = installMockApi([
      { match: "/api/tickets/x", status: 400, body: JSON.stringify({ detail: "Ticket exceeds the maximum length" }) },
    ]));
    const failure = await api.ticket("x").catch((error: unknown) => error);
    expect((failure as ApiError).message).toBe("Ticket exceeds the maximum length");
  });

  it("reports an unreachable API as status 0", async () => {
    ({ restore } = installMockApi([{ match: "/api/tickets/y", networkError: true }]));
    const failure = await api.ticket("y").catch((error: unknown) => error);
    expect((failure as ApiError).status).toBe(0);
  });
});
