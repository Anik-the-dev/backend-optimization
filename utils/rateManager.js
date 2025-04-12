let availablePoints = 1000;
let restoreRate = 50;
let lastRefillTime = Date.now();

export function updateThrottleStatus(throttleStatus) {
  availablePoints = throttleStatus.currentlyAvailable;
  restoreRate = throttleStatus.restoreRate;
  lastRefillTime = Date.now();
}

export async function waitForPoints(requestedCost, timeoutMs = 30000) {
  const start = Date.now();

  while (true) {
    refillPoints();

    if (availablePoints >= requestedCost) {
      availablePoints -= requestedCost;
      return;
    }

    if (Date.now() - start >= timeoutMs) {
      throw new Error(
        `Timeout: Unable to acquire ${requestedCost} points within ${timeoutMs}ms`
      );
    }

    await new Promise(setImmediate);
  }
}

function refillPoints() {
  const now = Date.now();
  const elapsedSeconds = (now - lastRefillTime) / 1000;
  const restored = Math.floor(elapsedSeconds * restoreRate);
  if (restored > 0) {
    availablePoints = Math.min(1000, availablePoints + restored);
    lastRefillTime = now;
  }
}
