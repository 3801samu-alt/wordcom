/**
 * SRS (Spaced Repetition System) Engine
 * SM-2 Algorithm based on 4 grades:
 * 0: Again, 1: Hard, 2: Good, 3: Easy
 */

function calculateSM2(grade, word, isMode1Again = false) {
  let { interval = 0, repetition = 0, easeFactor = 2.5, mistakeCount = 0 } = word;

  if (grade === 0) { // Again
    interval = 1; // Keep as review word (interval > 0), not new
    easeFactor = Math.max(1.3, easeFactor - 0.20);
    mistakeCount += 1;
    // Input Mode typographical error exception
    if (isMode1Again) {
      repetition = Math.max(0, repetition - 1);
    } else {
      repetition = 0;
    }
  }
  else if (grade === 1) { // Hard
    interval = Math.max(1, Math.round(interval * 1.2));
    easeFactor = Math.max(1.3, easeFactor - 0.15);
    // repetition unchanged
  }
  else if (grade === 2) { // Good
    interval = (interval === 0) ? 1 : Math.round(interval * easeFactor);
    // easeFactor unchanged
    repetition += 1;
  }
  else if (grade === 3) { // Easy
    interval = (interval === 0) ? 4 : Math.round(interval * easeFactor * 1.3);
    easeFactor += 0.15; // Bonus
    repetition += 1;
  }

  // For Again: nextReviewDate = now (re-appear today)
  // For others: nextReviewDate = today + interval days
  const nextReviewDate = new Date();
  if (grade !== 0) {
    nextReviewDate.setDate(nextReviewDate.getDate() + interval);
  }

  return {
    interval,
    repetition,
    easeFactor,
    mistakeCount,
    nextReviewDate
  };
}

// Format interval for display, e.g., "1日後"
function formatInterval(days) {
  if (days === 0) return '今日中';
  if (days < 30) return `${days}日後`;
  if (days < 365) return `${Math.floor(days / 30)}ヶ月後`;
  return `${Math.floor(days / 365)}年後`;
}

// Generate the preview intervals for all 4 grades given current word state
function getIntervalPreviews(word, isMode1 = false) {
  return {
    again: formatInterval(calculateSM2(0, word, isMode1).interval),
    hard: formatInterval(calculateSM2(1, word, false).interval),
    good: formatInterval(calculateSM2(2, word, false).interval),
    easy: formatInterval(calculateSM2(3, word, false).interval)
  };
}
