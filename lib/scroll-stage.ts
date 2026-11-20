export interface ScrollStageState {
  morphProgress: number;
  transitionFocus: number;
  scrollVelocity: number;
  burstImpulse: number;
  stageIntensity: number;
  sectionIndex: number;
}

export function createInitialScrollStageState(): ScrollStageState {
  return {
    morphProgress: 0,
    transitionFocus: 0,
    scrollVelocity: 0,
    burstImpulse: 0,
    stageIntensity: 0,
    sectionIndex: 0,
  };
}

export const LP_SCROLL_TO_EVENT = 'lp-lenis-scroll-to';
export const LP_BURST_EVENT = 'lp-cosmic-burst';

export function requestSmoothScrollTo(target: string | number, offset = -88) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent(LP_SCROLL_TO_EVENT, {
      detail: { target, offset },
    })
  );
}

export function triggerCosmicBurst(strength = 1.0) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent(LP_BURST_EVENT, {
      detail: { strength },
    })
  );
}
