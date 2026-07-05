import {
  useEffect,
  useRef,
  useCallback,
  useLayoutEffect,
  useMemo,
} from 'react';
import { useAtom, useSetAtom } from 'jotai';
import {
  currentwordContextState,
  currentwordState,
  userwordsState,
} from '../../states/recoil-states';

import { Sentence } from './Paragraph-Sentence-Phrase';

import { stripPunctuation } from '../../utils/punctuation';
import { countWordsInString, sentenceRegex } from '../../utils/textTokenizer';
import textsService from '../../services/texts';
import getToken from '../../utils/getToken';
import host from '../../services/host';

const DEBOUNCE_SAVE_MS = 1000;
const DEBOUNCE_RESIZE_MS = 300;
// Vertical offset (px) applied when mapping scroll position <-> top word, so the
// "current" word is the one just below the container's top padding.
const TOP_ANCHOR_OFFSET = 12;

type SentenceInfo = {
  paraIdx: number;
  text: string;
  wordCount: number;
  wordStartIndex: number;
  isLastInParagraph: boolean;
};

type WordOffset = { index: number; top: number };

const TextBody = function ({
  title,
  textBody,
  savedWordIndex,
  textId,
}: {
  title: string;
  textBody: string;
  savedWordIndex: number;
  textId: number;
}) {
  const [currentWord, setCurrentWord] = useAtom(currentwordState);
  const [userWords, setUserWords] = useAtom(userwordsState);
  const setCurrentWordContext = useSetAtom(currentwordContextState);

  // Build flat sentence list from paragraphs
  const allSentences = useMemo(() => {
    const paragraphs = textBody.split('\n').filter(Boolean);
    const sentences: SentenceInfo[] = [];
    let wordIndex = 0;

    for (let pIdx = 0; pIdx < paragraphs.length; pIdx += 1) {
      const matches = paragraphs[pIdx].match(sentenceRegex) || [''];
      for (let sIdx = 0; sIdx < matches.length; sIdx += 1) {
        const text = matches[sIdx];
        const wc = countWordsInString(text);
        sentences.push({
          paraIdx: pIdx,
          text,
          wordCount: wc,
          wordStartIndex: wordIndex,
          isLastInParagraph: sIdx === matches.length - 1,
        });
        wordIndex += wc;
      }
    }

    return sentences;
  }, [textBody]);

  // Group all sentences by paragraph (for rendering)
  const allParagraphGroups: SentenceInfo[][] = useMemo(() => {
    const groups: SentenceInfo[][] = [];
    for (let i = 0; i < allSentences.length; i += 1) {
      const sent = allSentences[i];
      const lastGroup = groups[groups.length - 1];
      if (lastGroup && lastGroup[0].paraIdx === sent.paraIdx) {
        lastGroup.push(sent);
      } else {
        groups.push([sent]);
      }
    }
    return groups;
  }, [allSentences]);

  const scrollRef = useRef<HTMLDivElement>(null);

  // Cache of each word's vertical offset within the scroll content, sorted by top.
  const wordOffsetsRef = useRef<WordOffset[]>([]);
  // True once the reader has actually scrolled, so a late position restore
  // won't yank them away from where they are.
  const userScrolledRef = useRef(false);
  // True while we programmatically scroll (restoring position), so those scroll
  // events aren't mistaken for the user scrolling or saved as progress.
  const isProgrammaticScrollRef = useRef(false);

  // Save progress refs/timers
  const pendingProgressRef = useRef<number | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progScrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Rebuild the word-offset cache from the live DOM (positions change on resize).
  const buildOffsetCache = useCallback(() => {
    const container = scrollRef.current;
    if (!container) return;

    const els = container.querySelectorAll<HTMLElement>('[data-word-index]');
    const offsets: WordOffset[] = [];
    for (let i = 0; i < els.length; i += 1) {
      const el = els[i];
      offsets.push({
        index: parseInt(el.getAttribute('data-word-index') || '0', 10),
        top: el.offsetTop,
      });
    }
    offsets.sort((a, b) => a.top - b.top);
    wordOffsetsRef.current = offsets;
  }, []);

  // Word index currently at the top of the viewport for a given scrollTop.
  const topWordIndexForScroll = useCallback((scrollTop: number) => {
    const offsets = wordOffsetsRef.current;
    if (offsets.length === 0) return 0;

    const target = scrollTop + TOP_ANCHOR_OFFSET;
    let lo = 0;
    let hi = offsets.length - 1;
    let ans = offsets[0].index;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (offsets[mid].top <= target) {
        ans = offsets[mid].index;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    return ans;
  }, []);

  // Scroll so the word with the given index sits at the top of the viewport.
  const scrollToWordIndex = useCallback((wordIndex: number) => {
    const container = scrollRef.current;
    const offsets = wordOffsetsRef.current;
    if (!container || offsets.length === 0) return;

    // Offsets are in reading order, so index increases with top.
    let best = offsets[0];
    for (let i = 0; i < offsets.length; i += 1) {
      if (offsets[i].index <= wordIndex) {
        best = offsets[i];
      } else {
        break;
      }
    }

    // Flag this as a programmatic scroll so the scroll handler ignores it.
    isProgrammaticScrollRef.current = true;
    if (progScrollTimerRef.current) clearTimeout(progScrollTimerRef.current);
    container.scrollTop = Math.max(0, best.top - TOP_ANCHOR_OFFSET);
    progScrollTimerRef.current = setTimeout(() => {
      isProgrammaticScrollRef.current = false;
    }, 120);
  }, []);

  // Save reading progress to the server (debounced)
  const saveProgress = useCallback(
    (wordIndex: number) => {
      if (!textId) return; // demo mode
      pendingProgressRef.current = wordIndex;

      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }

      saveTimerRef.current = setTimeout(async () => {
        try {
          await textsService.saveReadingProgress(textId, wordIndex);
          pendingProgressRef.current = null;
        } catch {
          // Silently fail — will retry on next scroll
        }
      }, DEBOUNCE_SAVE_MS);
    },
    [textId]
  );

  // Build the offset cache and restore the saved reading position on mount.
  useLayoutEffect(() => {
    buildOffsetCache();
    if (savedWordIndex > 0) {
      scrollToWordIndex(savedWordIndex);
    }

    // Rebuild once more after fonts/layout settle and restore again in case
    // reflow shifted positions, unless the reader has already scrolled.
    const settle = setTimeout(() => {
      buildOffsetCache();
      if (!userScrolledRef.current && savedWordIndex > 0) {
        scrollToWordIndex(savedWordIndex);
      }
    }, 200);

    return () => clearTimeout(settle);
    // Intentionally run once for this text.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The saved position can arrive after mount (a text opened from the list has
  // none until its full record loads). Restore to it when it appears, unless
  // the reader has already started scrolling.
  useEffect(() => {
    if (savedWordIndex > 0 && !userScrolledRef.current) {
      scrollToWordIndex(savedWordIndex);
    }
  }, [savedWordIndex, scrollToWordIndex]);

  // Track scroll → remember the top visible word and save it (debounced).
  const handleScroll = useCallback(() => {
    // Ignore scrolls we triggered ourselves while restoring position.
    if (isProgrammaticScrollRef.current) return;

    userScrolledRef.current = true;
    const container = scrollRef.current;
    if (!container) return;
    saveProgress(topWordIndexForScroll(container.scrollTop));
  }, [saveProgress, topWordIndexForScroll]);

  // Resize handler — rebuild offsets and keep the reader on the same word.
  useEffect(() => {
    let resizeTimer: ReturnType<typeof setTimeout>;

    const handleResize = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        const container = scrollRef.current;
        if (!container) return;
        const topIdx = topWordIndexForScroll(container.scrollTop);
        buildOffsetCache();
        scrollToWordIndex(topIdx);
      }, DEBOUNCE_RESIZE_MS);
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      clearTimeout(resizeTimer);
    };
  }, [buildOffsetCache, scrollToWordIndex, topWordIndexForScroll]);

  // Persist the latest position immediately on tab close AND on leaving the
  // reader — SPA navigation unmounts this component before the debounce fires.
  useEffect(() => {
    const flushProgress = () => {
      if (pendingProgressRef.current === null || !textId) return;

      const token = getToken();
      if (!token) return;

      fetch(`${host}/api/texts/${textId}/progress`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `bearer ${token}`,
        },
        body: JSON.stringify({
          pageStartWordIndex: pendingProgressRef.current,
        }),
        keepalive: true,
      });
      pendingProgressRef.current = null;
    };

    window.addEventListener('beforeunload', flushProgress);
    return () => {
      window.removeEventListener('beforeunload', flushProgress);
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
      if (progScrollTimerRef.current) {
        clearTimeout(progScrollTimerRef.current);
      }
      // Unmounting (navigating away) — save where we are right now.
      flushProgress();
    };
  }, [textId]);

  const isElement = function (
    element: Element | EventTarget
  ): element is Element {
    return (element as Element).nodeName !== undefined;
  };

  // Click on empty space clears the selected word; click on a multi-word phrase
  // span selects that phrase.
  const removeUnusedWordOrGetPhrase = function (
    event: React.MouseEvent<HTMLDivElement, MouseEvent>
  ) {
    const { target }: { target: Element | EventTarget } = event;
    if (
      !window.getSelection()?.toString() &&
      isElement(target) &&
      target.nodeName !== 'SPAN'
    ) {
      setCurrentWord(null);

      const updatedWords = [
        ...userWords.filter((wordObj) => wordObj.id !== undefined),
      ];
      setUserWords(updatedWords);
      setCurrentWordContext(null);
    } else if (
      isElement(target) &&
      target.nodeName === 'SPAN' &&
      target?.textContent
    ) {
      const text = target?.textContent?.split(' ').filter(Boolean);

      if (text.length > 1) {
        const current = userWords.filter((wordObj) => {
          if (target.textContent) {
            return (
              stripPunctuation(wordObj.word) ===
              stripPunctuation(target.textContent?.toLowerCase())
            );
          }
          return false;
        });
        if (current.length > 0) {
          setCurrentWord(current[0]);
        }
      }
    }

    window.getSelection()?.removeAllRanges();
  };

  return (
    <div
      onMouseUp={(event) => removeUnusedWordOrGetPhrase(event)}
      onScroll={handleScroll}
      id="text-body-container"
      ref={scrollRef}
      className={`relative h-full min-h-0 overflow-y-auto container mx-auto prose max-w-none dark:prose-invert p-4 md:col-span-1 md:col-start-1 bg-tertiary px-4 py-5 shadow sm:rounded-lg sm:px-6 ${
        currentWord && window.innerWidth < 768
          ? 'blur-xs bg-gray-300 dark:bg-gray-600'
          : ''
      }`}
    >
      <h1 className="mt-0 mb-4 text-base md:text-lg font-semibold text-secondary">
        {title}
      </h1>

      {allParagraphGroups.map((group) => (
        <div
          key={`pg-${group[0].paraIdx}-${group[0].wordStartIndex}`}
          className="mb-3"
        >
          {group.map((sent) => (
            <div key={`s-${sent.wordStartIndex}`} className="inline">
              <Sentence
                sentence={sent.text}
                startWordIndex={sent.wordStartIndex}
              />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
};

export default TextBody;
