export interface DurationMatch {
  differenceMs?: number;
  score: number;
  exact: boolean;
}

export function matchDuration(
  a?: number,
  b?: number
): DurationMatch {
  if (
    a == null ||
    b == null
  ) {
    return {
      score: 0.5,
      exact: false,
    };
  }

  const differenceMs =
    Math.abs(a - b);

  if (differenceMs <= 250) {
    return {
      differenceMs,
      score: 1,
      exact: true,
    };
  }

  if (differenceMs <= 500) {
    return {
      differenceMs,
      score: 0.99,
      exact: false,
    };
  }

  if (differenceMs <= 1000) {
    return {
      differenceMs,
      score: 0.97,
      exact: false,
    };
  }

  if (differenceMs <= 2000) {
    return {
      differenceMs,
      score: 0.90,
      exact: false,
    };
  }

  if (differenceMs <= 3000) {
    return {
      differenceMs,
      score: 0.75,
      exact: false,
    };
  }

  if (differenceMs <= 5000) {
    return {
      differenceMs,
      score: 0.40,
      exact: false,
    };
  }

  return {
    differenceMs,
    score: 0,
    exact: false,
  };
}
