import { describe, expect, it } from "vitest";
import {
  closePosition,
  cumulativeRealizedPnl,
  formatPnl,
  formatWinRate,
  openPosition,
  sessionPerformance,
  sideReport,
  summarizeSession,
  tradesToCsv,
  unrealizedPnl,
} from './paperTrade';

describe("openPosition", () => {
  it("opens a long when flat", () => {
    const result = openPosition(null, "long", 100, 50, "t1");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.position).toEqual({
        id: "t1",
        side: "long",
        entryPrice: 100,
        entryTime: 50,
      });
    }
  });

  it("rejects open when already in a position", () => {
    const open = openPosition(null, "short", 90, 10, "t1");
    expect(open.ok).toBe(true);
    if (!open.ok) return;
    const again = openPosition(open.position, "long", 95, 20, "t2");
    expect(again.ok).toBe(false);
  });
});

describe("closePosition", () => {
  it("realizes long PnL", () => {
    const open = openPosition(null, "long", 100, 10, "t1");
    expect(open.ok).toBe(true);
    if (!open.ok) return;
    const closed = closePosition(open.position, 112, 20);
    expect(closed.pnl).toBeCloseTo(12);
    expect(closed.exitPrice).toBe(112);
  });

  it("realizes short PnL", () => {
    const open = openPosition(null, "short", 100, 10, "t1");
    expect(open.ok).toBe(true);
    if (!open.ok) return;
    const closed = closePosition(open.position, 90, 20);
    expect(closed.pnl).toBeCloseTo(10);
  });
});

describe("unrealizedPnl / cumulative / session", () => {
  it("computes unrealized long and short", () => {
    expect(
      unrealizedPnl(
        { id: "1", side: "long", entryPrice: 100, entryTime: 1 },
        110,
      ),
    ).toBeCloseTo(10);
    expect(
      unrealizedPnl(
        { id: "1", side: "short", entryPrice: 100, entryTime: 1 },
        90,
      ),
    ).toBeCloseTo(10);
    expect(unrealizedPnl(null, 100)).toBeNull();
  });

  it("sums realized and session total", () => {
    const closed = [
      {
        id: "a",
        side: "long",
        entryPrice: 100,
        entryTime: 1,
        exitPrice: 110,
        exitTime: 2,
        pnl: 10,
      },
      {
        id: "b",
        side: "short",
        entryPrice: 50,
        entryTime: 3,
        exitPrice: 55,
        exitTime: 4,
        pnl: -5,
      },
    ];
    expect(cumulativeRealizedPnl(closed)).toBeCloseTo(5);
    const perf = sessionPerformance(
      closed,
      { id: "c", side: "long", entryPrice: 10, entryTime: 5 },
      12,
    );
    expect(perf.realized).toBeCloseTo(5);
    expect(perf.unrealized).toBeCloseTo(2);
    expect(perf.total).toBeCloseTo(7);
  });
});

describe("formatPnl", () => {
  it("formats signed values", () => {
    expect(formatPnl(1.2)).toBe("+1.20");
    expect(formatPnl(-3)).toBe("-3.00");
    expect(formatPnl(null)).toBe("—");
  });
});

describe("summarizeSession / export", () => {
  const sample = [
    {
      id: "a",
      side: "long",
      entryPrice: 100,
      entryTime: 1,
      exitPrice: 110,
      exitTime: 2,
      pnl: 10,
    },
    {
      id: "b",
      side: "long",
      entryPrice: 100,
      entryTime: 3,
      exitPrice: 95,
      exitTime: 4,
      pnl: -5,
    },
    {
      id: "c",
      side: "short",
      entryPrice: 50,
      entryTime: 5,
      exitPrice: 40,
      exitTime: 6,
      pnl: 10,
    },
    {
      id: "d",
      side: "short",
      entryPrice: 50,
      entryTime: 7,
      exitPrice: 60,
      exitTime: 8,
      pnl: -10,
    },
  ];

  it("computes overall and side reports", () => {
    const summary = summarizeSession(sample);
    expect(summary.overall.count).toBe(4);
    expect(summary.overall.wins).toBe(2);
    expect(summary.overall.losses).toBe(2);
    expect(summary.overall.winRate).toBeCloseTo(0.5);
    expect(summary.overall.totalPnl).toBeCloseTo(5);
    expect(summary.overall.maxProfit).toBeCloseTo(10);
    expect(summary.overall.maxLoss).toBeCloseTo(-10);

    expect(summary.long.count).toBe(2);
    expect(summary.long.winRate).toBeCloseTo(0.5);
    expect(summary.long.totalPnl).toBeCloseTo(5);
    expect(summary.long.maxProfit).toBeCloseTo(10);
    expect(summary.long.maxLoss).toBeCloseTo(-5);

    expect(summary.short.count).toBe(2);
    expect(summary.short.totalPnl).toBeCloseTo(0);
    expect(summary.short.maxLoss).toBeCloseTo(-10);
  });

  it("handles empty sessions", () => {
    const empty = sideReport([]);
    expect(empty.count).toBe(0);
    expect(empty.winRate).toBeNull();
    expect(empty.maxProfit).toBeNull();
    expect(formatWinRate(null)).toBe("—");
    expect(formatWinRate(0.5)).toBe("50.0%");
  });

  it("exports CSV with header and ISO times", () => {
    const csv = tradesToCsv([sample[0]]);
    const lines = csv.split("\n");
    expect(lines[0]).toBe(
      "id,side,entryPrice,entryTimeUtc,exitPrice,exitTimeUtc,pnl",
    );
    expect(lines[1]).toContain("a,long,100,");
    expect(lines[1]).toContain("1970-01-01T00:00:01.000Z");
    expect(lines[1]).toContain(",10");
  });
});
