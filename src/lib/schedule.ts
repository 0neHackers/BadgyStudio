/**
 * Yielding that survives a backgrounded tab.
 *
 * THE BUG THIS EXISTS FOR
 * The batch runner and the export settle step both yielded with
 * requestAnimationFrame. rAF does not fire while a tab is hidden, so the moment
 * someone switched away mid-run the loop stopped dead and never resumed. On a
 * hundred-person roster that is a near certainty, and it presents as the run
 * hanging and then failing rather than as anything obviously timing related.
 *
 * setTimeout is throttled in a background tab but it does keep firing, so the
 * run continues, more slowly, instead of stopping.
 *
 * The MessageChannel path is the fast one for a visible tab: it posts a macro
 * task without the 4ms clamp that nested setTimeouts pick up, so a foreground
 * run is not slowed down by making the background case work.
 */

const channel = typeof MessageChannel !== "undefined" ? new MessageChannel() : null;
const waiting: (() => void)[] = [];

if (channel) {
  channel.port1.onmessage = () => {
    waiting.shift()?.();
  };
}

/**
 * Hands control back to the browser. Works whether or not the tab is visible.
 *
 * V05.04 used MessageChannel only while visible and fell back to setTimeout
 * when hidden. That was the wrong way round. Chrome throttles timers in a
 * background tab to roughly one per second, and after five minutes hidden it
 * throttles them to one per minute. It does not throttle message-channel
 * tasks. So the fallback that existed to keep a background run alive was the
 * thing making a background run take hours: a handful of yields per row at a
 * second each is minutes per hundred rows, all of it spent waiting.
 *
 * MessageChannel is now the path in both cases, and setTimeout is only the
 * fallback for an environment that has no MessageChannel at all.
 */
export function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => {
    if (channel) {
      waiting.push(resolve);
      channel.port2.postMessage(null);
    } else {
      setTimeout(resolve, 0);
    }
  });
}

/**
 * Waits for a paint when one is possible.
 *
 * Only the interface needs this now. The render path used to wait on paints it
 * did not need, which cost two frames a row in a batch and considerably more
 * than that in a hidden tab; it commits with flushSync and watches for the
 * conditions it actually depends on instead. See components/BulkStudio.tsx and
 * lib/export.ts.
 */
export function nextPaint(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === "function" && !document.hidden) {
      requestAnimationFrame(() => resolve());
    } else {
      // No paint is coming in a hidden tab, so yield instead of pretending.
      void yieldToBrowser().then(resolve);
    }
  });
}

/** Retries an operation, backing off, so one transient failure in a long run
 *  does not cost the whole run. */
export async function withRetry<T>(
  operation: () => Promise<T>,
  attempts = 3,
  baseDelay = 250,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await operation();
    } catch (cause) {
      lastError = cause;
      if (attempt < attempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, baseDelay * (attempt + 1)));
      }
    }
  }
  throw lastError;
}
