import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NEW_LOOK_CLASS, NEW_LOOK_STORAGE_KEY, newLookBootScript, newLookOn, onNewLookChange, setNewLook } from '@/lib/skeleton/look'
import { NEW_DASHBOARD_FLAG } from '@/lib/dashboard/frame'

// The switch between today's skeleton and the new one: a class on <html>, remembered on the device so the page's
// first paint already has it. What is pinned: the script paints from the memory and from nothing else, the switch
// writes both, and a browser that refuses storage still follows the switch.

const html = () => document.documentElement

beforeEach(() => {
  window.localStorage.clear()
  html().className = 'font-a dark'
})
afterEach(() => {
  vi.restoreAllMocks()
  window.localStorage.clear()
  html().className = ''
})

const boot = () => new Function(newLookBootScript())()

describe('the script in the root layout', () => {
  it('puts the class on <html> for a device that remembers the new dashboard, and keeps the other classes', () => {
    window.localStorage.setItem(NEW_LOOK_STORAGE_KEY, '1')
    boot()
    expect(html().className.split(' ')).toEqual(['font-a', 'dark', NEW_LOOK_CLASS])
  })

  it('leaves a device that was never told with today\'s look', () => {
    boot()
    expect(html().classList.contains(NEW_LOOK_CLASS)).toBe(false)
  })

  it.each(['0', 'true', 'yes', '', ' 1', '<script>'])('paints from the one value it writes and from nothing else (%j)', (value) => {
    window.localStorage.setItem(NEW_LOOK_STORAGE_KEY, value)
    boot()
    expect(html().classList.contains(NEW_LOOK_CLASS)).toBe(false)
  })

  it('does not throw where storage is refused: the page still loads, with today\'s look', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError')
    })
    expect(boot).not.toThrow()
    expect(html().classList.contains(NEW_LOOK_CLASS)).toBe(false)
  })

  it('is one self-contained expression: it imports nothing and names the class and the key it shares with the switch', () => {
    const script = newLookBootScript()
    expect(script.startsWith('(function(){')).toBe(true)
    expect(script.endsWith('})();')).toBe(true)
    expect(script).toContain(JSON.stringify(NEW_LOOK_STORAGE_KEY))
    expect(script).toContain(JSON.stringify(NEW_LOOK_CLASS))
    expect(script).not.toMatch(/import|require/)
  })
})

describe('the switch', () => {
  it('turns the look on: the class, and the device\'s memory of it', () => {
    setNewLook(true)
    expect(newLookOn()).toBe(true)
    expect(html().className.split(' ')).toEqual(['font-a', 'dark', NEW_LOOK_CLASS])
    expect(window.localStorage.getItem(NEW_LOOK_STORAGE_KEY)).toBe('1')
  })

  it('turns it off again and forgets it, so the next load starts with today\'s look', () => {
    setNewLook(true)
    setNewLook(false)
    expect(newLookOn()).toBe(false)
    expect(html().className.split(' ')).toEqual(['font-a', 'dark'])
    expect(window.localStorage.getItem(NEW_LOOK_STORAGE_KEY)).toBeNull()
  })

  it('what the switch remembers is what the script reads: on, a new page starts with the look', () => {
    setNewLook(true)
    html().className = 'dark'
    boot()
    expect(newLookOn()).toBe(true)
    setNewLook(false)
    html().className = 'dark'
    boot()
    expect(newLookOn()).toBe(false)
  })

  it('tells its listeners once per change, and not at all when nothing changes', () => {
    const heard = vi.fn()
    const stop = onNewLookChange(heard)
    setNewLook(true)
    setNewLook(true)
    expect(heard).toHaveBeenCalledTimes(1)
    setNewLook(false)
    expect(heard).toHaveBeenCalledTimes(2)
    stop()
    setNewLook(true)
    expect(heard).toHaveBeenCalledTimes(2)
  })

  it('corrects a memory that is behind the page: the class is already there, the memory is written all the same', () => {
    // The script painted from an old memory that another tab has since cleared.
    html().classList.add(NEW_LOOK_CLASS)
    setNewLook(true)
    expect(window.localStorage.getItem(NEW_LOOK_STORAGE_KEY)).toBe('1')
  })

  it('still switches the page where storage is refused', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError')
    })
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError')
    })
    expect(() => setNewLook(true)).not.toThrow()
    expect(newLookOn()).toBe(true)
    expect(() => setNewLook(false)).not.toThrow()
    expect(newLookOn()).toBe(false)
  })
})

describe('names', () => {
  it('the class on <html> is the beta\'s own name, as the stylesheet writes it', () => {
    expect(NEW_LOOK_CLASS).toBe(NEW_DASHBOARD_FLAG)
  })
})
