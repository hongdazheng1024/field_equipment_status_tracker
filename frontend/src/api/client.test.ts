import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiFetch, setAuthToken, setUnauthorizedHandler, toQueryString } from "./client";

const fetchMock = vi.fn<typeof fetch>();

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
  setAuthToken(null);
  setUnauthorizedHandler(null);
});

describe("toQueryString", () => {
  it("skips empty values and joins arrays with commas", () => {
    expect(
      toQueryString({ q: "", siteId: 2, status: ["DOWN", "DEGRADED"], type: undefined, stale: true, tags: [] }),
    ).toBe("?siteId=2&status=DOWN%2CDEGRADED&stale=true");
  });

  it("returns an empty string when nothing is set", () => {
    expect(toQueryString({ q: undefined })).toBe("");
  });
});

describe("apiFetch", () => {
  it("prefixes /api, sends the bearer token and returns the JSON body", async () => {
    setAuthToken("abc");
    fetchMock.mockResolvedValue(jsonResponse(200, { ok: true }));

    await expect(apiFetch("/sites")).resolves.toEqual({ ok: true });

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/sites");
    expect((init!.headers as Record<string, string>).Authorization).toBe("Bearer abc");
  });

  it("sends a JSON body on POST", async () => {
    fetchMock.mockResolvedValue(jsonResponse(201, {}));
    await apiFetch("/equipment", { method: "POST", body: { name: "X" } });

    const init = fetchMock.mock.calls[0]![1]!;
    expect(init.method).toBe("POST");
    expect(init.body).toBe('{"name":"X"}');
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
  });

  it("returns undefined for 204 No Content", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await expect(apiFetch("/equipment/1", { method: "DELETE" })).resolves.toBeUndefined();
  });

  it("turns the API error shape into an ApiError", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(409, { error: { code: "CONFLICT", message: "Changed by Olivia", details: { current: { id: 1 } } } }),
    );

    const error = await apiFetch("/equipment/1/status-changes", { method: "POST", body: {} }).catch((e) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 409,
      code: "CONFLICT",
      message: "Changed by Olivia",
      details: { current: { id: 1 } },
    });
  });

  it("reports a failed connection as NETWORK_ERROR with status 0", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(apiFetch("/sites")).rejects.toMatchObject({ status: 0, code: "NETWORK_ERROR" });
  });

  it("calls the unauthorized handler when a token is rejected", async () => {
    const handler = vi.fn();
    setUnauthorizedHandler(handler);
    setAuthToken("expired");
    fetchMock.mockResolvedValue(jsonResponse(401, { error: { code: "UNAUTHORIZED", message: "Expired" } }));

    await expect(apiFetch("/sites")).rejects.toMatchObject({ status: 401 });
    expect(handler).toHaveBeenCalledOnce();
  });

  it("does not call it for a failed login (no token sent)", async () => {
    const handler = vi.fn();
    setUnauthorizedHandler(handler);
    fetchMock.mockResolvedValue(jsonResponse(401, { error: { code: "UNAUTHORIZED", message: "Invalid" } }));

    await expect(apiFetch("/auth/login", { method: "POST", body: {} })).rejects.toMatchObject({ status: 401 });
    expect(handler).not.toHaveBeenCalled();
  });
});
