/** Resource that can release listeners, timers, workers, and subscriptions. */
export interface IDisposable {
  dispose(): void;
}
