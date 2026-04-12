import { useEffect } from "react";
import { MEDIA_PREVIEW_ZOOM_STEP } from "../utils/textChatHelpers";

export default function useMediaPreviewKeyboardControls({
  mediaPreview,
  setMediaPreview,
  updateMediaPreviewIndex,
  updateMediaPreviewZoom,
  resetMediaPreviewZoom,
}) {
  useEffect(() => {
    if (!mediaPreview) {
      return undefined;
    }

    const handleEscape = (event) => {
      if (event.key === "Escape") {
        setMediaPreview(null);
        return;
      }

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        updateMediaPreviewIndex(-1);
        return;
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
        updateMediaPreviewIndex(1);
        return;
      }

      if (event.key === "+" || event.key === "=") {
        event.preventDefault();
        updateMediaPreviewZoom(MEDIA_PREVIEW_ZOOM_STEP);
        return;
      }

      if (event.key === "-" || event.key === "_") {
        event.preventDefault();
        updateMediaPreviewZoom(-MEDIA_PREVIEW_ZOOM_STEP);
        return;
      }

      if (event.key === "0") {
        event.preventDefault();
        resetMediaPreviewZoom();
      }
    };

    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("keydown", handleEscape);
    };
  }, [mediaPreview, resetMediaPreviewZoom, setMediaPreview, updateMediaPreviewIndex, updateMediaPreviewZoom]);
}
