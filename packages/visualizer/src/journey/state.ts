export interface JourneyStep {
  path: string;
  line?: number;
  reason?: string;
}

export interface Journey {
  steps: JourneyStep[];
  activeIndex: number;
}

export function startJourney(path: string, line?: number): Journey {
  return { steps: [{ path, ...(line === undefined ? {} : { line }) }], activeIndex: 0 };
}

export function followJourney(journey: Journey, step: JourneyStep): Journey {
  const active = journey.steps[journey.activeIndex];
  if (active.path === step.path) {
    const steps = [...journey.steps];
    steps[journey.activeIndex] = { ...active, line: step.line };
    return { ...journey, steps };
  }
  const steps = [...journey.steps.slice(0, journey.activeIndex + 1), step];
  return { steps, activeIndex: steps.length - 1 };
}

export function jumpJourney(journey: Journey, index: number): Journey {
  if (!Number.isInteger(index) || index < 0 || index >= journey.steps.length) return journey;
  return { ...journey, activeIndex: index };
}
