import { describe, expect, it } from "vitest";
import { createReplayEngine, REPLAY_SPEEDS } from './replayEngine';

/**
 * @param {number} time
 * @param {number} [close]
 */
function candle(time, close = 100) {
  return {
    time,
    open: close - 1,
    high: close + 1,
    low: close - 2,
    close,
  };
}

/**
 * @param {number} count
 * @param {number} [start]
 */
function series(count, start = 1000) {
  return Array.from({ length: count }, (_, i) => candle(start + i * 60, 100 + i));
}

describe("createReplayEngine", () => {
  it("starts idle with empty state", () => {
    const engine = createReplayEngine();
    expect(engine.getState()).toMatchObject({
      candles: [],
      index: 0,
      isPlaying: false,
      speed: 1,
      status: "idle",
    });
    expect(engine.getVisibleCandles()).toEqual([]);
    expect(engine.getCurrentCandle()).toBeNull();
    expect(engine.needsPrefetch()).toBe(false);
  });

  it("load resets to ready at index 0", () => {
    const engine = createReplayEngine();
    const candles = series(5);
    const state = engine.load(candles);

    expect(state.status).toBe("ready");
    expect(state.index).toBe(0);
    expect(state.isPlaying).toBe(false);
    expect(state.candles).toHaveLength(5);
    expect(engine.getCurrentCandle()?.time).toBe(candles[0].time);
    expect(engine.getVisibleCandles()).toHaveLength(1);
  });

  it("load with empty/invalid input returns idle", () => {
    const engine = createReplayEngine();
    engine.load(series(3));
    engine.play();

    const state = engine.load([]);
    expect(state.status).toBe("idle");
    expect(state.candles).toEqual([]);
    expect(state.isPlaying).toBe(false);
  });

  it("play and pause toggle status", () => {
    const engine = createReplayEngine();
    engine.load(series(3));

    expect(engine.play().status).toBe("playing");
    expect(engine.getState().isPlaying).toBe(true);

    expect(engine.pause().status).toBe("paused");
    expect(engine.getState().isPlaying).toBe(false);
  });

  it("stepForward advances index and sets paused when not playing", () => {
    const engine = createReplayEngine();
    engine.load(series(3));

    const mid = engine.stepForward();
    expect(mid.index).toBe(1);
    expect(mid.status).toBe("paused");
    expect(engine.getVisibleCandles()).toHaveLength(2);
  });

  it("stepForward while playing keeps playing status", () => {
    const engine = createReplayEngine();
    engine.load(series(3));
    engine.play();

    const mid = engine.stepForward();
    expect(mid.index).toBe(1);
    expect(mid.status).toBe("playing");
    expect(mid.isPlaying).toBe(true);
  });

  it("stepForward at last candle ends playback", () => {
    const engine = createReplayEngine();
    engine.load(series(2));
    engine.play();
    engine.stepForward(); // index 1 (last)

    const ended = engine.stepForward();
    expect(ended.index).toBe(1);
    expect(ended.status).toBe("ended");
    expect(ended.isPlaying).toBe(false);

    // Further play / step stays ended.
    expect(engine.play().status).toBe("ended");
    expect(engine.stepForward().status).toBe("ended");
  });

  it("stepBackward clamps at 0 and pauses", () => {
    const engine = createReplayEngine();
    engine.load(series(3));
    engine.play();
    engine.stepForward();
    engine.stepForward();

    const back = engine.stepBackward();
    expect(back.index).toBe(1);
    expect(back.status).toBe("paused");
    expect(back.isPlaying).toBe(false);

    engine.stepBackward();
    engine.stepBackward();
    expect(engine.getState().index).toBe(0);
  });

  it("seekToIndex clamps to bounds", () => {
    const engine = createReplayEngine();
    engine.load(series(5));

    expect(engine.seekToIndex(3).index).toBe(3);
    expect(engine.seekToIndex(-10).index).toBe(0);
    expect(engine.seekToIndex(99).index).toBe(4);
    expect(engine.getState().status).toBe("paused");
    expect(engine.getState().isPlaying).toBe(false);
  });

  it("seekToTime finds at-or-before and clamps before first candle", () => {
    const engine = createReplayEngine();
    const candles = series(4, 1000);
    engine.load(candles);

    expect(engine.seekToTime(1000 + 60 + 30).index).toBe(1);
    expect(engine.seekToTime(candles[2].time).index).toBe(2);
    expect(engine.seekToTime(0).index).toBe(0);
  });

  it("setSpeed only accepts known speeds", () => {
    const engine = createReplayEngine();
    for (const speed of REPLAY_SPEEDS) {
      expect(engine.setSpeed(speed).speed).toBe(speed);
    }
    expect(engine.setSpeed(3).speed).toBe(1);
    expect(engine.setSpeed(Number.NaN).speed).toBe(1);
  });

  it("appendCandles extends buffer without resetting index", () => {
    const engine = createReplayEngine({ prefetchThreshold: 2 });
    engine.load(series(5, 1000));
    engine.seekToIndex(3);

    const more = series(3, 1000 + 5 * 60);
    const state = engine.appendCandles(more);

    expect(state.index).toBe(3);
    expect(state.candles).toHaveLength(8);
    expect(engine.getCurrentCandle()?.time).toBe(1000 + 3 * 60);
  });

  it("appendCandles ignores duplicates and earlier times", () => {
    const engine = createReplayEngine();
    engine.load(series(3, 1000));
    engine.seekToIndex(1);

    const before = engine.getState();
    const again = engine.appendCandles([
      candle(1000),
      candle(1000 + 60),
      candle(1000 + 2 * 60),
    ]);

    expect(again.candles).toHaveLength(3);
    expect(again.index).toBe(before.index);
  });

  it("appendCandles after ended resumes to paused when room remains", () => {
    const engine = createReplayEngine();
    engine.load(series(2, 1000));
    engine.stepForward();
    engine.stepForward();
    expect(engine.getState().status).toBe("ended");

    engine.appendCandles(series(2, 1000 + 2 * 60));
    const state = engine.getState();
    expect(state.candles).toHaveLength(4);
    expect(state.index).toBe(1);
    expect(state.status).toBe("paused");
    expect(state.isPlaying).toBe(false);
  });

  it("needsPrefetch respects threshold", () => {
    const engine = createReplayEngine({ prefetchThreshold: 2 });
    engine.load(series(10));

    expect(engine.needsPrefetch()).toBe(false);
    engine.seekToIndex(7);
    expect(engine.needsPrefetch()).toBe(true);
    engine.seekToIndex(9);
    expect(engine.needsPrefetch()).toBe(true);
  });

  it("reset via load clears ended and playing state", () => {
    const engine = createReplayEngine();
    engine.load(series(2));
    engine.play();
    engine.stepForward();
    engine.stepForward();
    expect(engine.getState().status).toBe("ended");

    const next = engine.load(series(4, 5000));
    expect(next.status).toBe("ready");
    expect(next.index).toBe(0);
    expect(next.isPlaying).toBe(false);
    expect(next.candles[0].time).toBe(5000);
  });
});
