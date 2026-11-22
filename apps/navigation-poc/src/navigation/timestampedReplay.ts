export interface TimestampedSample {
  elapsedMs: number;
}

export interface TimestampedReplayOptions<T extends TimestampedSample> {
  startClockMs: number;
  timestampOriginMs: number;
  samples: readonly T[];
  signal: AbortSignal;
  now?: () => number;
  sleep?: (milliseconds: number, signal: AbortSignal) => Promise<void>;
  onSample: (sample: T, index: number, timestamp: number, deliveredAt: number) => void;
}

export interface TimestampedReplayResult {
  expectedSamples: number;
  deliveredSamples: number;
  maximumInterSampleGapMs: number;
  medianInterSampleGapMs: number;
}

function sleep(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new Error('Timestamped replay was cancelled.'));
      return;
    }

    const timer = setTimeout(() => {
      signal.removeEventListener('abort', abort);
      resolve();
    }, milliseconds);
    const abort = () => {
      clearTimeout(timer);
      reject(new Error('Timestamped replay was cancelled.'));
    };
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) {
      abort();
    }
  });
}

function median(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

export async function playTimestampedSamples<T extends TimestampedSample>({
  startClockMs,
  timestampOriginMs,
  samples,
  signal,
  now = () => performance.now(),
  sleep: wait = sleep,
  onSample,
}: TimestampedReplayOptions<T>): Promise<TimestampedReplayResult> {
  if (!Number.isFinite(startClockMs) || !Number.isFinite(timestampOriginMs)) {
    throw new Error('Timestamped replay requires finite clock origins.');
  }
  if (samples.some((sample, index) =>
    !Number.isFinite(sample.elapsedMs) ||
    sample.elapsedMs < 0 ||
    (index > 0 && sample.elapsedMs < samples[index - 1].elapsedMs),
  )) {
    throw new Error('Timestamped replay samples must have finite, ordered timestamps.');
  }

  const deliveryTimes: number[] = [];
  const interSampleGaps: number[] = [];

  for (const [index, sample] of samples.entries()) {
    if (signal.aborted) {
      throw new Error('Timestamped replay was cancelled.');
    }

    const targetClockMs = startClockMs + sample.elapsedMs;
    let remainingMs = targetClockMs - now();
    while (remainingMs > 0) {
      await wait(remainingMs, signal);
      remainingMs = targetClockMs - now();
    }

    const deliveredAt = now();
    const previousDeliveryAt = deliveryTimes.at(-1);
    if (previousDeliveryAt !== undefined) {
      interSampleGaps.push(Math.max(0, deliveredAt - previousDeliveryAt));
    }
    deliveryTimes.push(deliveredAt);
    onSample(sample, index, timestampOriginMs + sample.elapsedMs, deliveredAt);
  }

  return {
    expectedSamples: samples.length,
    deliveredSamples: deliveryTimes.length,
    maximumInterSampleGapMs: Math.max(0, ...interSampleGaps),
    medianInterSampleGapMs: median(interSampleGaps),
  };
}
