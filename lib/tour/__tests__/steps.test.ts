import { describe, it, expect, afterEach } from 'vitest'
import { TOUR_ANCHORS, DIMENSION_CARD_KEYS } from '../anchors'
import { TOUR_STEPS, TOUR_STEP_COUNT, stepSelector, findStepElement, type TourStepDef } from '../steps'

describe('TOUR_STEPS contract', () => {
  it('opens with an uncounted welcome and counts the rest', () => {
    expect(TOUR_STEPS[0].anchor).toBeNull()
    expect(TOUR_STEPS.length).toBe(7)
    expect(TOUR_STEP_COUNT).toBe(6)
  })

  it('anchors every counted step to a registered anchor', () => {
    const registered = new Set<string>(Object.values(TOUR_ANCHORS))
    for (const step of TOUR_STEPS.slice(1)) {
      expect(step.anchor, `step "${step.title}" has no anchor`).toBeTruthy()
      expect(registered.has(step.anchor as string), `unregistered anchor ${step.anchor}`).toBe(true)
      if (step.card) {
        expect(DIMENSION_CARD_KEYS).toContain(step.card)
      }
    }
  })

  it('closes on the sidebar nav — the ruled "there is more" gesture', () => {
    expect(TOUR_STEPS[TOUR_STEPS.length - 1].anchor).toBe(TOUR_ANCHORS.sidebarNav)
  })

  it('has real copy on every step', () => {
    for (const step of TOUR_STEPS) {
      expect(step.title.trim().length).toBeGreaterThan(0)
      expect(step.body.trim().length).toBeGreaterThan(0)
    }
  })

  it('composes the dimension-card selector with its card key', () => {
    const card = TOUR_STEPS.find((s) => s.card)
    expect(card).toBeTruthy()
    expect(stepSelector(card!)).toBe('[data-tour="dimension-card"][data-tour-card="referrers"]')
    expect(stepSelector(TOUR_STEPS[0])).toBeNull()
  })
})

describe('findStepElement', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  function addAnchor(anchor: string, visible: boolean): HTMLElement {
    const el = document.createElement('div')
    el.setAttribute('data-tour', anchor)
    // jsdom has no layout: offsetParent is null for everything, so visibility
    // is modelled explicitly — which is also the property the code reads.
    Object.defineProperty(el, 'offsetParent', {
      get: () => (visible ? document.body : null),
    })
    document.body.appendChild(el)
    return el
  }

  // The onboarding chip is the anchor that really renders twice (desktop bar +
  // mobile header). It is not a step of the script, so the step is built here;
  // until 20-10-2026 these tests used the bell's step.
  const chipStep: TourStepDef = { anchor: TOUR_ANCHORS.onboardingChip, title: 'Chip', body: 'Chip' }

  it('picks the visible mount, not the first DOM match', () => {
    addAnchor('onboarding-chip', false) // the display:none twin comes first
    const visible = addAnchor('onboarding-chip', true)
    expect(findStepElement(chipStep)).toBe(visible)
  })

  // A hidden node handed to driver reads as "found" and spotlights a 0×0
  // rect at the viewport corner (24-08 audit) — hidden is NOT a fallback.
  it('returns undefined when no mount is visible', () => {
    addAnchor('onboarding-chip', false)
    addAnchor('onboarding-chip', false)
    expect(findStepElement(chipStep)).toBeUndefined()
  })

  it('returns undefined when the anchor is absent — driver waits, not crashes', () => {
    expect(findStepElement(chipStep)).toBeUndefined()
  })
})
