const EMOJI_PICKER_SEARCH_REVEAL_SCROLL_TOP = 0;

export function getNextEmojiPickerSearchVisibility({
  previousScrollTop,
  currentScrollTop,
  searchHidden,
}) {
  const previousTop = Math.max(0, Number(previousScrollTop) || 0);
  const currentTop = Math.max(0, Number(currentScrollTop) || 0);

  if (currentTop <= EMOJI_PICKER_SEARCH_REVEAL_SCROLL_TOP) {
    return false;
  }

  if (currentTop > previousTop) {
    return true;
  }

  return Boolean(searchHidden);
}
