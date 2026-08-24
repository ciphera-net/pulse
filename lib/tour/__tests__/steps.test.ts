import { describe, it, expect, afterEach } from 'vitest'
import { TOUR_ANCHORS, DIMENSION_CARD_KEYS } from '../anchors'
import { TOUR_STEPS, TOUR_STEP_COUNT, stepSelector, findStepElement } from '../steps'

describe('TOUR_STEPS contract', () => {
  it('opens with an uncounted welcome and counts the rest', () => {
    expect(TOUR_STEPS[0].anchor).toBeNull()
    expect(TOUR_STEPS.length).toBe(8)
    expect(TOUR_STEP_COUNT).toBe(7)
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

  const bellStep = TOUR_STEPS.find((s) => s.anchor === TOUR_ANCHORS.notificationBell)!

  it('picks the visible mount, not the first DOM match', () => {
    addAnchor('notification-bell', false) // the display:none twin comes first
    const visible = addAnchor('notification-bell', true)
    expect(findStepElement(bellStep)).toBe(visible)
  })

  it('falls back to the first match when no mount is visible', () => {
    const first = addAnchor('notification-bell', false)
    addAnchor('notification-bell', false)
    expect(findStepElement(bellStep)).toBe(first)
  })

  it('returns undefined when the anchor is absent — driver waits, not crashes', () => {
    expect(findStepElement(bellStep)).toBeUndefined()
  })
})
