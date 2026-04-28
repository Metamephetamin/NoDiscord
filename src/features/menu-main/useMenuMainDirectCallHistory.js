import { useCallback, useEffect, useState } from "react";
import { createId } from "../../utils/menuMainModel";
import {
  readDirectCallHistory,
  writeDirectCallHistory,
} from "./menuMainDirectCallState";

export default function useMenuMainDirectCallHistory(storageKey) {
  const [directCallHistory, setDirectCallHistory] = useState([]);

  useEffect(() => {
    setDirectCallHistory(readDirectCallHistory(storageKey));
  }, [storageKey]);

  useEffect(() => {
    writeDirectCallHistory(storageKey, directCallHistory);
  }, [directCallHistory, storageKey]);

  const appendDirectCallHistoryEntry = useCallback(({
    peerUserId,
    peerName,
    peerAvatar,
    direction,
    outcome,
    timestamp = new Date().toISOString(),
  }) => {
    if (!peerUserId) {
      return;
    }

    setDirectCallHistory((previous) => [
      {
        id: createId("direct-call-log"),
        peerUserId: String(peerUserId),
        peerName: String(peerName || "Пользователь"),
        peerAvatar: String(peerAvatar || ""),
        direction: String(direction || ""),
        outcome: String(outcome || "ended"),
        timestamp,
      },
      ...previous,
    ].slice(0, 24));
  }, []);

  return {
    directCallHistory,
    appendDirectCallHistoryEntry,
  };
}
