import { describe, expect, it } from "vitest";
import {
  buildOverlays,
  computeEma,
  computeSma,
  getIndicator,
  indicatorRequiresAuth,
  ungatedIndicatorIds,
} from './indicators';

/** @param {number[]} closes */
function candlesFromCloses(closes) {
  return closes.map((close, i) => ({
    time: 1_700_000_000 + i * 60,
    open: close,
    high: close,
    low: close,
    close,
  }));
}

describe("computeSma", () => {
  it("returns empty when fewer candles than period", () => {
    expect(computeSma(candlesFromCloses([1, 2, 3]), { period: 5 })).toEqual([]);
  });

  it("computes period-3 SMA", () => {
    const data = computeSma(candlesFromCloses([1, 2, 3, 4, 5]), { period: 3 });
    expect(data).toHaveLength(3);
    expect(data[0].value).toBeCloseTo(2);
    expect(data[1].value).toBeCloseTo(3);
    expect(data[2].value).toBeCloseTo(4);
    expect(data[0].time).toBe(1_700_000_000 + 2 * 60);
  });
});

describe("computeEma", () => {
  it("returns empty when fewer candles than period", () => {
    expect(computeEma(candlesFromCloses([1, 2]), { period: 3 })).toEqual([]);
  });

  it("seeds with SMA then applies EMA", () => {
    const closes = [1, 2, 3, 4, 5];
    const data = computeEma(candlesFromCloses(closes), { period: 3 });
    expect(data).toHaveLength(3);
    // First value = SMA(1,2,3) = 2
    expect(data[0].value).toBeCloseTo(2);
    const k = 2 / (3 + 1);
    const second = 4 * k + 2 * (1 - k);
    expect(data[1].value).toBeCloseTo(second);
    const third = 5 * k + second * (1 - k);
    expect(data[2].value).toBeCloseTo(third);
  });
});

describe("buildOverlays / getIndicator", () => {
  it("resolves registered indicators", () => {
    expect(getIndicator("sma20")?.label).toBe("Simple moving average 20");
    expect(getIndicator("smc")?.label).toBe("Smart money concepts");
    expect(getIndicator("smc")?.requiresAuth).toBeFalsy();
    expect(indicatorRequiresAuth("smc")).toBe(false);
    expect(indicatorRequiresAuth("sma20")).toBe(false);
    expect(getIndicator("missing")).toBeNull();
  });

  it("builds overlays only for active ids with enough data", () => {
    const candles = candlesFromCloses(Array.from({ length: 25 }, (_, i) => i + 1));
    const overlays = buildOverlays(candles, ["sma20", "ema20", "nope"]);
    expect(overlays.map((o) => o.id)).toEqual(["sma20", "ema20"]);
    expect(overlays[0].type).toBe("line");
    if (overlays[0].type === "line") {
      expect(overlays[0].data.length).toBeGreaterThan(0);
    }
  });

  it("builds an smc overlay when the indicator is active", () => {
    const candles = candlesFromCloses(Array.from({ length: 110 }, () => 100));
    candles[0] = { ...candles[0], high: 101, low: 90, close: 100 };
    for (let i = 1; i <= 50; i += 1) {
      candles[i] = { ...candles[i], high: 101, low: 99.5, close: 100 };
    }
    candles[51] = { ...candles[51], high: 120, low: 99, close: 110 };
    for (let i = 52; i <= 101; i += 1) {
      candles[i] = { ...candles[i], high: 111, low: 109, close: 110 };
    }
    candles[102] = { ...candles[102], high: 125, low: 110, close: 122 };
    const overlays = buildOverlays(candles, ["smc"]);
    expect(overlays).toHaveLength(1);
    expect(overlays[0]?.type).toBe("smc");
    if (overlays[0]?.type === "smc") {
      expect(overlays[0].scene.segments.length).toBeGreaterThan(0);
    }
  });

  it("keeps free indicators when signed out", () => {
    expect(ungatedIndicatorIds(["sma20", "smc"], true)).toEqual(["sma20", "smc"]);
    expect(ungatedIndicatorIds(["sma20", "smc"], false)).toEqual(["sma20", "smc"]);
  });
});
