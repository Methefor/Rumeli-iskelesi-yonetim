import { createDemoState, type DemoState } from './store'

let state: DemoState | null = null

/** The single in-memory demo store for this page session (resets on reload — demo data is never persisted). */
export function demoState(): DemoState {
  if (!state) state = createDemoState()
  return state
}

/** Test/support hook: rebuild the store, optionally anchored to a fixed "now". */
export function resetDemoState(now?: Date): DemoState {
  state = createDemoState(now)
  return state
}
