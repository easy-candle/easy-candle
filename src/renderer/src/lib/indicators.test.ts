import { describe, expect, it } from "vitest";
import {
  buildOverlays,
  computeEma,
  computeSma,
  getIndicator,
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
    expect(getIndicator("sma20")?.label).toBe("SMA 20");
    expect(getIndicator("missing")).toBeNull();
  });

  it("builds overlays only for active ids with enough data", () => {
    const candles = candlesFromCloses(Array.from({ length: 25 }, (_, i) => i + 1));
    const overlays = buildOverlays(candles, ["sma20", "ema20", "nope"]);
    expect(overlays.map((o) => o.id)).toEqual(["sma20", "ema20"]);
    expect(overlays[0].type).toBe("line");
    expect(overlays[0].data.length).toBeGreaterThan(0);
  });
});
