export interface CancellablePromise<T> extends Promise<T> {
  cancel: () => void;
}
