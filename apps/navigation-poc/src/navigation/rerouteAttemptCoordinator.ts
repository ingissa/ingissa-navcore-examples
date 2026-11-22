export interface RerouteAttempt {
  id: string;
  controller: AbortController;
}

export function createAttemptDeadline(timeoutMs: number, onTimeout: () => void): () => void {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error('Reroute deadline must be a positive finite duration.');
  }
  const timer = setTimeout(onTimeout, timeoutMs);
  return () => clearTimeout(timer);
}

export class RerouteAttemptCoordinator {
  private sequence = 0;
  private activeAttempt: RerouteAttempt | null = null;

  begin(): RerouteAttempt | null {
    if (this.activeAttempt) {
      return null;
    }

    this.sequence += 1;
    const attempt = {
      id: `reroute-${this.sequence}`,
      controller: new AbortController(),
    };
    this.activeAttempt = attempt;
    return attempt;
  }

  get current(): RerouteAttempt | null {
    return this.activeAttempt;
  }

  isCurrent(attempt: RerouteAttempt): boolean {
    return this.activeAttempt === attempt && !attempt.controller.signal.aborted;
  }

  complete(attempt: RerouteAttempt): boolean {
    if (this.activeAttempt !== attempt) {
      return false;
    }
    this.activeAttempt = null;
    return true;
  }

  cancel(): RerouteAttempt | null {
    const attempt = this.activeAttempt;
    if (!attempt) {
      return null;
    }
    this.activeAttempt = null;
    attempt.controller.abort();
    return attempt;
  }
}
