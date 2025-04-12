// --- retryManager.js ---
let currentConcurrency = 10;
let activeCount = 0;
const queue = [];
const chunkConcurrencyStats = new Map();

/**
 * Dynamically adjusts concurrency based on API feedback.
 * Call `setConcurrency()` when Shopify throttle status updates.
 */
export function setConcurrency(newLimit) {
  if (!isNaN(newLimit)) {
    const newC = Math.min(100, Math.max(1, Math.floor(newLimit)));
    if (newC !== currentConcurrency) {
      console.log(`⚙️  Adjusted concurrency: ${currentConcurrency} → ${newC}`);
      currentConcurrency = newC;
    }
  }
}

export function getCurrentConcurrency() {
  return currentConcurrency;
}

export function trackConcurrency(chunkIndex) {
  if (!chunkConcurrencyStats.has(chunkIndex)) {
    chunkConcurrencyStats.set(chunkIndex, { sum: 0, count: 0 });
  }
  const stat = chunkConcurrencyStats.get(chunkIndex);
  stat.sum += currentConcurrency;
  stat.count += 1;
}

export function getAverageConcurrency(chunkIndex) {
  const stat = chunkConcurrencyStats.get(chunkIndex);
  if (!stat || stat.count === 0) return currentConcurrency;
  return stat.sum / stat.count;
}

export function clearConcurrencyStats() {
  chunkConcurrencyStats.clear();
}

/**
 * Limits concurrency of a task based on the dynamic concurrency value.
 */
export async function limitedConcurrency(task, chunkIndex = 0) {
  if (activeCount >= currentConcurrency) {
    await new Promise(resolve => queue.push(resolve));
  }

  activeCount++;

  try {
    trackConcurrency(chunkIndex);
    return await task();
  } finally {
    activeCount--;
    if (queue.length > 0) {
      const next = queue.shift();
      next();
    }
  }
}

/**
 * Retry wrapper with exponential backoff and jitter.
 */
export async function retryWithBackoff(task, retries = 2, initialDelay = 1000) {
  let attempt = 0;
  let delay = initialDelay;
  let lastError;

  const maxAttempts = retries + 1;

  while (attempt < maxAttempts) {
    try {
      if (attempt > 0) {
        console.log(`[RETRY] Attempt ${attempt + 1}/${maxAttempts}`);
      }
      return await task();
    } catch (error) {
      lastError = error;
      attempt++;
      if (attempt < maxAttempts) {
        const jitter = Math.random() * 100;
        console.warn(
          `[RETRY] Failed attempt ${attempt}. Retrying in ${delay + jitter}ms...`
        );
        await new Promise(resolve => setTimeout(resolve, delay + jitter));
        delay *= 2;
      }
    }
  }

  console.error(`[RETRY] All ${maxAttempts} attempts failed.`);
  throw lastError;
}
