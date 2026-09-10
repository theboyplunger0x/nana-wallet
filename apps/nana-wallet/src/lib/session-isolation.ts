/**
 * Cross-user session isolation (PMU-021).
 *
 * Accounts switch (logout or a second user logging in). A module-level
 * generation counter plus an AbortController registry let the app cancel
 * in-flight requests and drop late responses from the previous account before
 * they can reach the new user's cache.
 *
 * Cache keys are additionally scoped by the resolved `userId` from GET /v1/me,
 * so even a response that survives an abort cannot populate the wrong user's
 * React Query entry. The React Query cache is also cleared on logout/switch
 * (see the logout handler) to wipe conversation and preview state.
 */

let generation = 0;
const controllers = new Set<AbortController>();

export type SessionGuard = {
  generation: number;
  signal: AbortSignal;
  controller: AbortController;
};

/** The current account-generation counter. */
export function getSessionGeneration(): number {
  return generation;
}

/** Registers the start of a request that belongs to the current generation. */
export function beginRequest(): SessionGuard {
  const controller = new AbortController();
  controllers.add(controller);
  return {
    generation,
    signal: controller.signal,
    controller,
  };
}

/** Removes a finished request from the in-flight registry. */
export function finishRequest(controller: AbortController): void {
  controllers.delete(controller);
}

/** True when a request started on the current generation still belongs to it. */
export function isSessionCurrent(guardGeneration: number): boolean {
  return guardGeneration === generation;
}

/**
 * Aborts every in-flight request and advances the generation. Call this on
 * logout and on account switch so a late response from user A is discarded and
 * any still-running fetch is cancelled before user B renders.
 */
export function resetSession(): void {
  generation += 1;
  for (const controller of controllers) controller.abort();
  controllers.clear();
}
