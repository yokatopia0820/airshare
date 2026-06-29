export function createSearchSession({ AbortControllerImpl = AbortController } = {}) {
  let currentId = 0;
  let currentController = null;

  return {
    begin() {
      currentId += 1;
      currentController?.abort();
      const controller = new AbortControllerImpl();
      currentController = controller;
      return {
        id: currentId,
        signal: controller.signal,
        abort: () => controller.abort()
      };
    },
    invalidate() {
      currentId += 1;
      currentController?.abort();
      currentController = null;
      return currentId;
    },
    isCurrent(id) {
      return id === currentId;
    },
    currentId() {
      return currentId;
    },
    currentSignal() {
      return currentController?.signal;
    }
  };
}
