import { useCallback, useEffect, useRef } from "react";

export default function useStableEvent(handler) {
  const handlerRef = useRef(handler);

  useEffect(() => {
    handlerRef.current = handler;
  }, [handler]);

  return useCallback((...args) => handlerRef.current?.(...args), []);
}
