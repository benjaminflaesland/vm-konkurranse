import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useAdminSession } from "../src/hooks/useAdminSession.js";
import { useCompetitionData } from "../src/hooks/useCompetitionData.js";

describe("client data hooks", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("cacher kun vellykket offentlig hydrering og bruker den ved nettverksfeil", async () => {
    const payload = { data: { participants: [{ id: "a" }], fasit: {}, settings: {} }, revision: "r1" };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => payload })
      .mockRejectedValueOnce(new Error("offline"));
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useCompetitionData());

    await expect(result.current.load({ allowPublicCache: true })).resolves.toEqual(payload);
    await expect(result.current.load({ allowPublicCache: true })).resolves.toMatchObject({
      data: payload.data,
      revision: null,
      cached: true,
    });
  });

  it("sender baseRevision ved lagring og beholder konfliktstatus", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({ error: "Konflikt", revision: "remote" }),
    }));
    const { result } = renderHook(() => useCompetitionData());
    await expect(result.current.save({ participants: [], fasit: {}, settings: {} }, "local")).rejects.toMatchObject({
      message: "Konflikt",
      status: 409,
      revision: "remote",
    });
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toMatchObject({ baseRevision: "local", data: { schemaVersion: 4 } });
  });

  it("bruker kun serverstyrt adminsesjon", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true }) }));
    const { result } = renderHook(() => useAdminSession());
    await act(() => result.current.create("hemmelig"));
    expect(fetch).toHaveBeenCalledWith("/.netlify/functions/auth", expect.objectContaining({ method: "POST" }));
    expect(localStorage.length).toBe(0);
  });
});
