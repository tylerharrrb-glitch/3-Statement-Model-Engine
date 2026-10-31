// Fixed-point iteration for one year. Switch = 0 is a single pass; switch = 1 iterates.
export const ITERATION_CAP = 100;
/** Stricter than the 1 EGP the brief sets as the ceiling, so three-way comparison stays inside 1 EGP after compounding. */
export const TOLERANCE_EGP = 0.01;

export interface IterationResult<T> { result: T; iterations: number; converged: boolean; delta: number }

export function iterate<T, G>(
  initial: G,
  step: (guess: G) => { result: T; next: G },
  distance: (a: G, b: G) => number,
  circular: boolean,
): IterationResult<T> {
  let guess = initial;
  let last = step(guess);
  if (!circular) return { result: last.result, iterations: 1, converged: true, delta: 0 };
  let n = 1;
  let delta = distance(guess, last.next);
  while (delta >= TOLERANCE_EGP && n < ITERATION_CAP) {
    guess = last.next;
    last = step(guess);
    delta = distance(guess, last.next);
    n++;
  }
  return { result: last.result, iterations: n, converged: delta < TOLERANCE_EGP, delta };
}
