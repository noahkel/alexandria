import { TouchEvent, useRef, useState } from 'react';

import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { UserWord } from '@alexandria/shared';
import {
  markedwordsState,
  userwordsState,
  currentwordState,
  currentwordContextState,
} from '../../states/recoil-states';

import phraseFromSelection from '../../utils/phraseSelection';

/**
 * Max distance (px) a finger may travel between touchstart and touchend for the
 * gesture to still count as a tap rather than a scroll.
 */
const TAP_MOVE_THRESHOLD = 10;

/** CSS classes shared between Word/Sentence components and measurement DOM */
export const WORD_WRAPPER_CLASSES =
  'inline-block text-xl md:text-lg my-2 md:my-1.5';
export const WORD_SPAN_CLASSES =
  'cursor-pointer border border-transparent py-2 md:py-1 p-px rounded-md';
export const NON_WORD_CLASSES = 'inline text-xl md:text-lg my-2 md:my-1.5';

const Word = function ({
  word,
  dataKey,
  context,
  wordIndex,
}: {
  word: string;
  dataKey: string;
  context: string;
  wordIndex?: number;
}) {
  const [userWords, setUserWords] = useAtom(userwordsState);
  const setCurrentWordContext = useSetAtom(currentwordContextState);
  const setCurrentWord = useSetAtom(currentwordState);
  const markedWords = useAtomValue(markedwordsState);

  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const [isTouch, setIsTouch] = useState(false);
  const [isWordInPhrase, setIsWordInPhrase] = useState(false);

  const wordStatus = markedWords[word.toLowerCase()];

  const getHighlightedWordOrPhrase = function () {
    const selection: Selection | null = window.getSelection();

    if (selection?.toString() && selection !== null) {
      const newPhrase = phraseFromSelection(selection);

      const existingWord = userWords.filter(
        (wordObj) => wordObj.word === newPhrase && wordObj.id
      )[0];
      let newWordObject: UserWord;

      if (existingWord) {
        newWordObject = existingWord;
      } else {
        newWordObject = {
          word: `${newPhrase.toLowerCase()}`,
          status: 'learning',
          translations: [],
        };

        setCurrentWord(newWordObject);
        setCurrentWordContext(context);
      }

      // if userWords does not include the new word
      if (
        userWords.filter(
          (wordObj) =>
            wordObj.word.toLowerCase() === newWordObject?.word.toLowerCase()
        ).length === 0
      ) {
        // removes any words without an id, meaning that they also have no translation
        const updatedWords = [
          ...userWords.filter((wordObj) => wordObj.id !== undefined),
          newWordObject,
        ];
        setUserWords(updatedWords);
      }
    }
  };

  const getClickedOnWord = function (
    event: React.MouseEvent | TouchEvent<HTMLSpanElement>
  ) {
    const input = event.target as HTMLElement;
    const possiblePhraseDiv = input?.parentElement?.parentElement;
    const pointerEvent = event.nativeEvent as PointerEvent | TouchEvent;

    // checks if user tapped on an existing phrase, if so, show the phrase instead of the word
    if (
      possiblePhraseDiv?.dataset?.type === 'phrase' &&
      possiblePhraseDiv?.textContent &&
      pointerEvent.type === 'touchend'
    ) {
      const current = userWords.filter(
        (wordObj) =>
          wordObj.word === possiblePhraseDiv?.textContent?.toLowerCase()
      );

      if (current.length === 1) {
        setCurrentWord(current[0]);
        setCurrentWordContext(context);
      }
    } else {
      const selectedWord = input.textContent || '';

      const wordObj = userWords.filter(
        (arrWordObj) =>
          arrWordObj.word.toLowerCase() === selectedWord.toLowerCase()
      );

      if (wordObj.length > 0) {
        const wordObject = { ...wordObj[0] };

        if (wordObject.status === undefined) {
          wordObject.status = 'learning';
        }

        const updatedWords = [
          ...userWords.filter(
            (arrWordObj) =>
              arrWordObj.word.toLowerCase() !== selectedWord.toLowerCase() &&
              arrWordObj.id
          ),
          wordObject,
        ];
        setUserWords(updatedWords);
        setCurrentWord(wordObject);
        setCurrentWordContext(context);
      } else {
        const newWordObj: UserWord = {
          word: `${selectedWord.toLowerCase()}`,
          status: 'learning',
          translations: [],
        };

        setCurrentWord(newWordObj);
        setCurrentWordContext(context);

        const updatedWords = [
          ...userWords.filter((wordObject) => wordObject.id !== undefined),
          newWordObj,
        ];
        setUserWords(updatedWords);
      }
    }
  };

  const isElement = function (
    element: Element | EventTarget
  ): element is Element {
    return (element as Element).nodeName !== undefined;
  };

  const highlightWordsInPhrases = function (target: EventTarget | Element) {
    if (isElement(target)) {
      const possiblePhraseDiv = target?.parentElement?.parentElement;

      // checks if user is hovering over an existing phrase
      if (possiblePhraseDiv?.dataset?.type === 'phrase') {
        setIsWordInPhrase(true);
      } else {
        setIsWordInPhrase(false);
      }
    }
  };

  let wordClass = '';
  if (wordStatus === 'learning') {
    wordClass = 'bg-fuchsia-500/40 dark:bg-fuchsia-500/40';
  } else if (wordStatus === 'familiar') {
    wordClass = 'bg-sky-400/40 dark:bg-sky-600/40';
  }

  return (
    <div className={WORD_WRAPPER_CLASSES}>
      <span
        onTouchEnd={(event) => {
          setIsTouch(true);

          // Distinguish a tap from a scroll-drag by how far the finger moved.
          const start = touchStartRef.current;
          const touch = event.changedTouches[0];
          const movedDistance =
            start && touch
              ? Math.hypot(touch.clientX - start.x, touch.clientY - start.y)
              : 0;

          // Movement beyond the threshold means the user was scrolling, not
          // tapping a word — leave the word untouched.
          if (movedDistance > TAP_MOVE_THRESHOLD) {
            return;
          }

          if (window.getSelection()?.toString()) {
            getHighlightedWordOrPhrase();
          } else {
            getClickedOnWord(event);
            // Suppress the emulated mouse click that a touch generates, so it
            // can't fall through to a link/button in the translation overlay
            // that now appears under the finger.
            event.preventDefault();
          }
          window.getSelection()?.removeAllRanges();
          window.getSelection()?.empty();
        }}
        onMouseUp={(event) => {
          const pointerEvent = event.nativeEvent as PointerEvent | TouchEvent;

          if (
            window.getSelection()?.toString() &&
            pointerEvent.type === 'mouseup' &&
            !isTouch
          ) {
            getHighlightedWordOrPhrase();
          } else if (pointerEvent.type === 'mouseup' && !isTouch) {
            getClickedOnWord(event);
          }

          window.getSelection()?.removeAllRanges();
          window.getSelection()?.empty();
          setIsTouch(false);
        }}
        onTouchStart={(event) => {
          const touch = event.touches[0];
          touchStartRef.current = touch
            ? { x: touch.clientX, y: touch.clientY }
            : null;
        }}
        onMouseOver={(event) => highlightWordsInPhrases(event.target)}
        className={`${wordClass} ${
          isWordInPhrase
            ? 'betterhover:hover:bg-violet-400 dark:betterhover:hover:bg-violet-600'
            : 'betterhover:hover:border-blue-500'
        } ${WORD_SPAN_CLASSES}`}
        data-key={dataKey}
        data-type={'word'}
        data-word-index={wordIndex}
      >
        {word}
      </span>
    </div>
  );
};

export default Word;
