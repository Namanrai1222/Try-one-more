import { describe, expect, it } from 'vitest';
import { FixedStepDriver, MAX_STEPS_PER_FRAME, STEP_MS } from '../src/index.ts';

function counting() {
  let steps = 0;
  const driver = new FixedStepDriver(() => {
    steps++;
  });
  return { driver, steps: () => steps };
}

describe('FixedStepDriver', () => {
  it('runs one step per fixed step of real time', () => {
    const { driver } = counting();
    expect(driver.advance(STEP_MS).steps).toBe(1);
  });

  it('accumulates partial frames and reports alpha', () => {
    const { driver } = counting();
    const first = driver.advance(10);
    expect(first.steps).toBe(0);
    expect(first.alpha).toBeCloseTo(10 / STEP_MS);
    expect(driver.advance(10).steps).toBe(1);
  });

  it('caps catch-up and drops the backlog (no spiral of death)', () => {
    const { driver } = counting();
    const r = driver.advance(1000);
    expect(r.steps).toBe(MAX_STEPS_PER_FRAME);
    expect(r.droppedMs).toBeGreaterThan(0);
    expect(r.alpha).toBeGreaterThanOrEqual(0);
    expect(r.alpha).toBeLessThan(1);
    // the next normal frame is not still paying for the backlog
    expect(driver.advance(STEP_MS).steps).toBe(1);
  });

  it('ignores negative, NaN and infinite deltas', () => {
    const { driver, steps } = counting();
    driver.advance(-50);
    driver.advance(Number.NaN);
    driver.advance(Number.POSITIVE_INFINITY);
    expect(steps()).toBe(0);
  });

  it('a 120Hz display still yields ~60 sim steps per second', () => {
    const { driver, steps } = counting();
    for (let i = 0; i < 120; i++) driver.advance(1000 / 120);
    expect(steps()).toBeGreaterThanOrEqual(59);
    expect(steps()).toBeLessThanOrEqual(60);
  });

  it('a 30Hz display yields ~60 sim steps per second', () => {
    const { driver, steps } = counting();
    for (let i = 0; i < 30; i++) driver.advance(1000 / 30);
    expect(steps()).toBeGreaterThanOrEqual(59);
    expect(steps()).toBeLessThanOrEqual(60);
  });
});
