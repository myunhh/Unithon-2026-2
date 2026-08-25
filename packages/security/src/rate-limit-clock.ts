import {
  RateLimitClockError,
  type RateLimitClock,
  validateClockNow,
} from './rate-limit-types.js'

export class SystemRateLimitClock implements RateLimitClock {
  nowMs(): number {
    return Date.now()
  }
}

export class ManualRateLimitClock implements RateLimitClock {
  #currentNowMs: number

  constructor(initialNowMs = 0) {
    this.#currentNowMs = validateClockNow(initialNowMs)
  }

  nowMs(): number {
    return this.#currentNowMs
  }

  setNowMs(nextNowMs: number): void {
    this.#currentNowMs = validateClockNow(nextNowMs)
  }

  advanceBy(deltaMs: number): void {
    if (!Number.isSafeInteger(deltaMs) || deltaMs < 0) {
      throw new RateLimitClockError('Clock advances must be non-negative safe integers.')
    }
    const nextNowMs = this.#currentNowMs + deltaMs
    if (!Number.isSafeInteger(nextNowMs)) {
      throw new RateLimitClockError('Clock advance exceeds the safe integer range.')
    }
    this.#currentNowMs = nextNowMs
  }
}
