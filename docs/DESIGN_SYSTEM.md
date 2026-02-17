# Pulse Design System

**Version:** 1.0  
**Last Updated:** 2026-02-06  
**Maintained by:** Ciphera Design Team

---

## Overview

This document defines the visual language and design patterns for Pulse Analytics. All components and pages should follow these standards to ensure consistency, accessibility, and brand alignment.

---

## 🎨 Colors

### Brand Colors

```css
/* Primary Brand Color */
--brand-orange: #FD5E0F;
--brand-orange-hover: #E54E00; /* Darker for hover states */

/* Usage */
- Primary CTAs, links, focus rings
- Accent elements, badges
- Never use for large backgrounds (too vibrant)
```

### Neutral Scale

Using Tailwind's neutral palette (50-950):

| Token | Light Mode | Dark Mode | Usage |
|-------|------------|-----------|--------|
| `neutral-50` | #FAFAFA | - | Subtle backgrounds |
| `neutral-100` | #F5F5F5 | - | Card backgrounds, disabled states |
| `neutral-200` | #E5E5E5 | - | Borders, dividers |
| `neutral-300` | #D4D4D4 | - | Borders (hover) |
| `neutral-400` | #A3A3A3 | #A3A3A3 | Secondary text (dark mode) |
| `neutral-500` | #737373 | - | Tertiary text, placeholders |
| `neutral-600` | #525252 | - | Body text (light mode) |
| `neutral-700` | #404040 | - | - |
| `neutral-800` | #262626 | #262626 | Borders, backgrounds (dark mode) |
| `neutral-900` | #171717 | #171717 | Headings, primary text |
| `neutral-950` | #0A0A0A | - | - |

### Semantic Colors

```css
--color-success: #10B981; /* Green for success states */
--color-warning: #F59E0B; /* Amber for warnings */
--color-error: #EF4444;   /* Red for errors, destructive actions */
```

### Color Usage Rules

**Text Colors:**
- **Headings:** `text-neutral-900 dark:text-white`
- **Body text:** `text-neutral-600 dark:text-neutral-400`
- **Secondary text:** `text-neutral-500 dark:text-neutral-400`
- **Tertiary/disabled:** `text-neutral-400 dark:text-neutral-500`
- **Links:** `text-brand-orange hover:text-brand-orange-hover`

**Backgrounds:**
- **Page:** `bg-white dark:bg-neutral-900`
- **Cards:** `bg-white dark:bg-neutral-900`
- **Subtle sections:** `bg-neutral-50 dark:bg-neutral-800/50`
- **Overlays:** `bg-white/80 dark:bg-neutral-900/80` (with backdrop-blur)

**Borders:**
- **Standard:** `border-neutral-200 dark:border-neutral-800`
- **Subtle:** `border-neutral-200/50 dark:border-neutral-800/50`
- **Focus rings:** `ring-brand-orange`
- **Danger actions:** `border-red-200 dark:border-red-900`

---

## 📝 Typography

### Font Family

```tsx
font-family: 'Plus Jakarta Sans', system-ui, sans-serif
```

Loaded via Next.js `next/font/google` in root layout.

### Heading Scale

| Element | Size (Mobile → Desktop) | Weight | Usage |
|---------|-------------------------|--------|-------|
| **H1 (Marketing)** | `text-4xl → text-5xl` | `font-bold` | Landing pages, about, FAQ, installation |
| **H1 (Hero)** | `text-5xl → text-7xl` | `font-bold` | Home page hero only |
| **H1 (App)** | `text-2xl` | `font-bold` | Dashboard, settings, app pages |
| **H2 (Section)** | `text-2xl` | `font-bold` | Major page sections |
| **H2 (Panel)** | `text-xl` | `font-semibold` | Panel headers (realtime, modals) |
| **H3 (Section)** | `text-lg` | `font-semibold` | Dashboard widgets, subsections |
| **H3 (Card)** | `text-xl` | `font-bold` | Feature cards, integration cards |
| **H4 (Label)** | `text-base` | `font-semibold` | Footer sections, small headers |

### Body Text

| Size | Class | Usage |
|------|-------|-------|
| **Large** | `text-xl` | Hero descriptions, intro paragraphs |
| **Base** | `text-base` (default) | Body text, card descriptions |
| **Small** | `text-sm` | Help text, labels, metadata |
| **Micro** | `text-xs` | Badges, timestamps, fine print |

### Font Weights

- `font-bold` (700): H1, H2, card titles, stat values
- `font-semibold` (600): H2 panels, H3 sections, buttons
- `font-medium` (500): Links, labels, secondary headings
- `font-normal` (400): Body text

### Line Height

- **Headings:** Default tight (`leading-tight` or none)
- **Body:** `leading-relaxed` for readability

### Text Color Patterns

```tsx
// Headings
className="text-neutral-900 dark:text-white"

// Body text (most readable)
className="text-neutral-600 dark:text-neutral-400"

// Secondary/helper text
className="text-neutral-500 dark:text-neutral-400"

// Disabled/placeholder
className="text-neutral-400 dark:text-neutral-500"
```

---

## 📏 Spacing System

### Padding Scale

| Value | Size | Usage |
|-------|------|-------|
| `p-3` | 12px | Icon containers, compact badges |
| `p-4` | 16px | Card headers, small cards, stat displays |
| `p-6` | 24px | Standard cards, forms, modals |
| `p-8` | 32px | Feature cards, spacious sections |
| `p-10` | 40px | Page containers |
| `p-12` | 48px | Empty states, hero sections |

### Vertical Spacing (Sections)

| Value | Size | Usage |
|-------|------|-------|
| `py-8` | 32px | App page containers |
| `py-10` | 40px | Standard pages |
| `py-16` | 64px | Content sections |
| `py-20` | 80px | Marketing hero sections |

### Gaps (Flexbox/Grid)

| Value | Size | Usage |
|-------|------|-------|
| `gap-2` | 8px | Icon+text pairs, inline elements |
| `gap-3` | 12px | Button groups, small layouts |
| `gap-4` | 16px | Form fields, button bars |
| `gap-6` | 24px | Card grids, main layouts |
| `gap-8` | 32px | Large section spacing |

### Margins

| Value | Usage |
|-------|-------|
| `mb-2` to `mb-4` | Between related elements |
| `mb-6` to `mb-8` | Between sections |
| `mb-16` to `mb-32` | Major page divisions |

---

## 🔲 Border Radius

| Element | Radius | Class | Example |
|---------|--------|-------|---------|
| **Cards** | 16px | `rounded-2xl` | Dashboard cards, feature cards |
| **Buttons** | 12px | `rounded-xl` | Primary, secondary buttons |
| **Inputs** | 8px | `rounded-lg` | Text inputs, selects, textareas |
| **Tabs** | 8px | `rounded-lg` | Tab buttons |
| **Badges** | Full | `rounded-full` | Status badges, tags |
| **Small UI** | 8px | `rounded-lg` | Small buttons, icons |

**Rule:** Larger elements = larger radius. Cards are most prominent, so `rounded-2xl`.

---

## 🎭 Shadows

### Shadow Scale

```tsx
// Subtle (cards at rest)
shadow-sm

// Medium (hover states)
shadow-md, shadow-lg

// Prominent (elevated elements, popovers)
shadow-xl, shadow-2xl

// Glow effects (CTAs)
shadow-lg shadow-brand-orange/20
```

### Usage Examples

```tsx
// Card at rest
className="rounded-2xl border border-neutral-200 dark:border-neutral-800 shadow-sm"

// Card hover
className="hover:shadow-xl hover:-translate-y-1 transition-all"

// Primary CTA
className="shadow-lg shadow-brand-orange/20"
```

---

## 🎯 Focus States

### Standard Focus Pattern

For most interactive elements:
```tsx
focus:outline-none focus:ring-2 focus:ring-brand-orange focus:ring-offset-2
```

### Compact Pattern (Links, Small Elements)

```tsx
focus:outline-none focus:ring-2 focus:ring-brand-orange focus:rounded
```

### Danger Actions (Delete, Reset)

```tsx
focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2
```

### Inset Focus (Selected Elements)

```tsx
focus:outline-none focus:ring-2 focus:ring-brand-orange focus:ring-inset
```

**Rule:** ALL interactive elements must have a visible focus state for keyboard accessibility (WCAG 2.1 Level AA).

---

## 🧩 Custom CSS Classes

**Location:** `styles/globals.css`

### `.card-glass`

Glass card effect with backdrop blur (premium feel):
```css
.card-glass {
  @apply bg-white/80 dark:bg-neutral-900/80;
  @apply backdrop-blur-xl;
  @apply border border-neutral-200/50 dark:border-neutral-800/50;
  @apply rounded-2xl;
  @apply transition-all duration-300 ease-out;
}
```

**Usage:** Feature cards on home page, pricing cards

---

### `.gradient-text`

Orange gradient for emphasized text:
```css
.gradient-text {
  @apply bg-gradient-to-r from-brand-orange to-brand-orange-hover bg-clip-text text-transparent;
}
```

**Usage:** Hero headlines ("privacy-conscious" on home page)

---

### `.badge-primary`

Primary badge style (orange theme):
```css
.badge-primary {
  @apply inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider;
  @apply bg-brand-orange/10 text-brand-orange border border-brand-orange/20;
}
```

**Usage:** "Privacy-First Analytics" badge, "FAQ" badge, page indicators

---

### `.bg-grid-pattern`

Subtle dot grid background:
```css
.bg-grid-pattern {
  background-image: radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0);
  background-size: 32px 32px;
}
```

**Usage:** Marketing page backgrounds (with radial mask for fade effect)

---

## 🧱 Component Patterns

### Button Variants

**Primary (Brand Action):**
```tsx
<Button variant="primary">Get Started</Button>
// Orange background, white text, shadow on hover
```

**Secondary (Neutral Action):**
```tsx
<Button variant="secondary">Cancel</Button>
// White background, border, neutral text
```

**Danger (Destructive Action):**
```tsx
<Button variant="danger">Delete</Button>
// Red background, white text (for critical actions)
```

---

### Empty States

**Pattern:**
```tsx
<div className="flex flex-col items-center justify-center text-center gap-3 p-8">
  <div className="rounded-full bg-neutral-100 dark:bg-neutral-800 p-3">
    <IconComponent className="w-6 h-6 text-neutral-500 dark:text-neutral-400" />
  </div>
  <p className="text-sm font-medium text-neutral-900 dark:text-white">
    No data yet
  </p>
  <p className="text-xs text-neutral-500 dark:text-neutral-400">
    Data will appear here once visitors arrive
  </p>
</div>
```

**Usage:** Dashboard widgets with no data, empty site lists, etc.

---

### Loading States

**Full Page Loading:**
```tsx
<LoadingOverlay 
  logoSrc="/pulse_icon_no_margins.png"
  title="Pulse"
/>
```

**Inline Loading:**
```tsx
<Button isLoading={true}>
  Saving...
</Button>
```

**Skeleton Loading:**
```tsx
<div className="animate-pulse rounded-2xl bg-neutral-100 dark:bg-neutral-800 h-48" />
```

---

### Success/Error States

**Success Toast:**
```tsx
toast.success('Site created successfully')
// Green toast with checkmark
```

**Error Toast:**
```tsx
toast.error('Failed to load data')
// Red toast with X icon
```

**Error Display:**
```tsx
<div className="text-red-500 text-sm text-center">
  {error}
</div>
```

---

## 🎬 Animations

### Framer Motion Patterns

#### Page Entrance
```tsx
<motion.div
  initial={{ opacity: 0, y: 20 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ duration: 0.5 }}
>
  {content}
</motion.div>
```

#### Stagger Animation
```tsx
{items.map((item, i) => (
  <motion.div
    key={i}
    initial={{ opacity: 0, y: 20 }}
    whileInView={{ opacity: 1, y: 0 }}
    viewport={{ once: true }}
    transition={{ duration: 0.5, delay: i * 0.1 }}
  >
    {item}
  </motion.div>
))}
```

#### Hover Scale
```tsx
<motion.div
  whileHover={{ scale: 1.05 }}
  transition={{ duration: 0.2 }}
>
  {content}
</motion.div>
```

#### List Item Entry/Exit
```tsx
<AnimatePresence mode="popLayout">
  {items.map(item => (
    <motion.div
      key={item.id}
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -10 }}
      transition={{ duration: 0.2 }}
    >
      {item}
    </motion.div>
  ))}
</AnimatePresence>
```

---

### CSS Transitions

**Duration Standards:**
- **Fast (200ms):** Input focus, button clicks, immediate feedback
- **Medium (300ms):** Hover effects, color changes, icon transforms
- **Slow (500ms):** Page entrances, large movements

**Easing:**
- Default: `ease-out` (feels snappy)
- Alternative: `ease-in-out` (smooth both ways)

```tsx
// Standard hover
className="transition-colors duration-200 hover:text-brand-orange"

// Card hover
className="transition-all duration-300 hover:-translate-y-1 hover:shadow-xl"
```

---

## 📱 Responsive Breakpoints

Using Tailwind defaults:

| Breakpoint | Size | Usage |
|------------|------|-------|
| `sm:` | 640px | Small tablets, large phones |
| `md:` | 768px | Tablets, small laptops |
| `lg:` | 1024px | Laptops, desktops |
| `xl:` | 1280px | Large desktops |

### Common Patterns

**Grid Layouts:**
```tsx
// 1 col mobile, 2 col tablet, 3 col desktop
className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
```

**Typography:**
```tsx
// Smaller on mobile, larger on desktop
className="text-4xl md:text-5xl"
```

**Padding:**
```tsx
// Less padding on mobile
className="px-4 sm:px-6"
```

---

## 🔘 Buttons

### Variant Usage

**Primary (Orange):**
- Main CTAs ("Get Started", "Create Site", "Save Changes")
- Positive actions
- One per screen section max

**Secondary (Neutral):**
- Cancel, Back, alternative actions
- Can have multiple per section

**Ghost (Minimal):**
- Tertiary actions, "View All" links
- Inline actions that shouldn't be prominent

**Danger (Red):**
- Delete, Reset Data, irreversible actions
- Always confirm before action

### Size Variants

```tsx
// Default
<Button>Save</Button>

// Large (CTAs)
<Button className="px-8 py-4 text-lg">Get Started</Button>

// Small (compact UI)
<Button className="text-sm px-4 py-2">Add</Button>
```

---

## 📦 Cards

### Standard Card

```tsx
<div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-6">
  {content}
</div>
```

### Glass Card (Premium Feel)

```tsx
<div className="card-glass p-8 hover:-translate-y-1 hover:shadow-xl transition-all duration-300">
  {content}
</div>
```

**When to use Glass:** Marketing pages, feature showcases, hero sections

### Hover Effects

```tsx
// Subtle lift
className="hover:-translate-y-1 hover:shadow-md transition-all"

// Scale
className="hover:scale-105 transition-transform"
```

---

## 🏷️ Badges

### Primary Badge
```tsx
<span className="badge-primary">
  <span className="w-1.5 h-1.5 rounded-full bg-brand-orange animate-pulse" />
  Privacy-First Analytics
</span>
```

### Status Badges

**Active/Live:**
```tsx
<div className="flex items-center gap-2 rounded-full bg-green-50 px-2 py-1 text-xs font-medium text-green-700 dark:bg-green-900/20 dark:text-green-400">
  <span className="relative flex h-2 w-2">
    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
    <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
  </span>
  Active
</div>
```

---

## 🎨 Special Effects

### Background Glow (Atmosphere)

```tsx
<div className="absolute inset-0 -z-10 pointer-events-none">
  <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-brand-orange/10 rounded-full blur-[128px] opacity-60" />
  <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-neutral-500/10 rounded-full blur-[128px] opacity-40" />
</div>
```

### Grid Pattern Background

```tsx
<div 
  className="absolute inset-0 bg-grid-pattern opacity-[0.02] dark:opacity-[0.05]"
  style={{ maskImage: 'radial-gradient(ellipse at center, black 0%, transparent 70%)' }}
/>
```

### SVG Underline (Accent)

```tsx
<svg className="absolute -bottom-2 left-0 w-full h-3 text-brand-orange/30" viewBox="0 0 200 12" preserveAspectRatio="none">
  <path d="M0 9C50 3 150 3 200 9" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
</svg>
```

---

## ♿ Accessibility

### Focus Indicators

**ALL interactive elements** must have visible focus states. See "Focus States" section above.

### Semantic HTML

- Use proper heading hierarchy (H1 → H2 → H3, no skipping)
- Use `<button>` for actions, `<Link>` for navigation
- Use `<nav>` for navigation sections
- Use `<main>` for primary content

### Alt Text

- All images must have descriptive `alt` attributes
- Decorative images use `alt=""` or `aria-hidden="true"`

### Keyboard Navigation

- Tab order should follow visual order
- All actions accessible via keyboard
- No keyboard traps
- Focus visible at all times

### ARIA Attributes

**Current usage (limited but correct):**
- `aria-label` on icon-only buttons (social links)
- `aria-hidden="true"` on decorative elements (arrows, ornaments)

**Could enhance:**
- `role="tablist"` on tab navigation
- `aria-live="polite"` on realtime counters
- `role="dialog"` on modals

---

## 🌓 Dark Mode

### Implementation

Using Tailwind's `dark:` prefix with class-based switching.

### Color Adjustments

**Backgrounds:**
- Light: `bg-white`, `bg-neutral-50`
- Dark: `dark:bg-neutral-900`, `dark:bg-neutral-800`

**Text:**
- Light: `text-neutral-900`, `text-neutral-600`
- Dark: `dark:text-white`, `dark:text-neutral-400`

**Borders:**
- Light: `border-neutral-200`
- Dark: `dark:border-neutral-800`

### Testing

Always test both light and dark modes:
- Color contrast (4.5:1 minimum in both modes)
- Focus ring visibility (should stand out in both modes)
- Glass effects (should work in both modes)

---

## 📊 Dashboard Widgets

### Standard Widget Layout

```tsx
<div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-6 h-full flex flex-col">
  {/* Header */}
  <div className="flex items-center justify-between mb-4">
    <h3 className="text-lg font-semibold text-neutral-900 dark:text-white">
      Widget Title
    </h3>
    <button className="text-xs font-medium text-neutral-500 hover:text-neutral-900 transition-colors focus:...">
      View All
    </button>
  </div>
  
  {/* Content */}
  <div className="flex-1 min-h-[200px]">
    {hasData ? (
      <DataDisplay />
    ) : (
      <EmptyState />
    )}
  </div>
</div>
```

### Tab Toggles (Inside Widgets)

```tsx
<div className="flex p-1 bg-neutral-100 dark:bg-neutral-800 rounded-lg">
  {tabs.map(tab => (
    <button
      key={tab}
      onClick={() => setActiveTab(tab)}
      className={`px-3 py-1 text-xs font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-brand-orange ${
        activeTab === tab
          ? 'bg-white dark:bg-neutral-700 text-neutral-900 dark:text-white shadow-sm'
          : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
      }`}
    >
      {tab}
    </button>
  ))}
</div>
```

---

## 📋 Forms

### Input Styling

```tsx
<Input
  id="field-name"
  placeholder="Enter value"
  className="rounded-lg"
/>
// Uses @ciphera-net/ui Input component
// Automatically includes focus states, dark mode
```

### Label Pattern

```tsx
<label htmlFor="field-name" className="block text-sm font-medium mb-2 text-neutral-700 dark:text-neutral-300">
  Field Name
</label>
```

### Help Text

```tsx
<p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
  Additional information about this field.
</p>
```

### Error Display

```tsx
{error && (
  <div className="text-red-500 text-sm text-center">
    {error}
  </div>
)}
```

---

## 🎭 Code Blocks (Integration Pages)

### VS Code-Style Syntax Highlighting

```tsx
<div className="bg-[#1e1e1e] rounded-xl overflow-hidden shadow-2xl border border-neutral-800">
  {/* Header bar */}
  <div className="flex items-center px-4 py-3 bg-[#252526] border-b border-neutral-800">
    <div className="flex gap-2">
      <div className="w-3 h-3 rounded-full bg-red-500/20" />
      <div className="w-3 h-3 rounded-full bg-yellow-500/20" />
      <div className="w-3 h-3 rounded-full bg-green-500/20" />
    </div>
    <span className="ml-4 text-xs text-neutral-500 font-mono">filename.tsx</span>
  </div>
  
  {/* Code content */}
  <div className="p-6 overflow-x-auto">
    <code className="font-mono text-sm text-neutral-300">
      {/* Syntax-highlighted code */}
    </code>
  </div>
</div>
```

**Colors for syntax:**
- Blue `#61AFEF`: Keywords, tags
- Orange `#D19A66`: Strings
- Purple `#C678DD`: Functions
- Green `#98C379`: Comments
- White `#ABB2BF`: Text

---

## 🌍 Internationalization (Future)

**Currently:** English only  
**When implementing i18n:**
- Use `next-intl` or similar
- Extract all strings to translation files
- Maintain "Swiss infrastructure" messaging
- Support: EN, DE, FR, IT (Swiss languages)

---

## 📐 Layout Patterns

### Page Container

```tsx
// App pages
<div className="w-full max-w-6xl mx-auto px-4 sm:px-6 py-8">
  {content}
</div>

// Marketing pages
<div className="w-full max-w-4xl mx-auto px-4 pt-20 pb-10">
  {content}
</div>
```

### Two-Column Settings Layout

```tsx
<div className="flex flex-col md:flex-row gap-8">
  {/* Sidebar */}
  <nav className="w-full md:w-64 flex-shrink-0">
    {tabs}
  </nav>
  
  {/* Content */}
  <div className="flex-1">
    {content}
  </div>
</div>
```

---

## 🔌 Integration with @ciphera-net/ui

### Current Usage

```tsx
import { 
  Button,
  Input,
  Select,
  Modal,
  LoadingOverlay,
  DatePicker,
  Captcha,
  // Icons
  CheckCircleIcon,
  SettingsIcon,
  // etc.
} from '@ciphera-net/ui'
```

**Version:** `^0.0.45`

### Preset

Pulse uses the Ciphera UI Tailwind preset:
```ts
// tailwind.config.ts
presets: [
  require('@ciphera-net/ui/dist/tailwind-preset').default,
]
```

**Provides:**
- Brand colors (brand-orange)
- Background gradients (bg-ciphera-gradient)
- Neutral scale extension

---

## 🎯 Design Principles

### 1. Privacy-First Visual Language
- Clean, minimal design
- No tracking pixels, no external fonts from CDNs
- Swiss aesthetic (precision, trust, neutrality)

### 2. Accessibility First
- WCAG 2.1 Level AA compliance
- Keyboard navigation throughout
- Clear focus indicators
- Readable text contrast

### 3. Performance
- Lightweight animations (opacity, translate only)
- Optimized images
- Code splitting by route
- Fast transitions (200-500ms max)

### 4. Brand Consistency
- Orange used sparingly (accents only)
- Neutral-heavy palette
- Glass effects for premium feel
- Consistent with other Ciphera products

---

## 🛠️ Component Library

### Available from @ciphera-net/ui

**Buttons:** Primary, Secondary, Danger variants  
**Forms:** Input, Select, Checkbox, DatePicker  
**Feedback:** Toast (Sonner), LoadingOverlay  
**Security:** Captcha component  
**Icons:** Full icon set from Lucide  
**Layout:** Modal component  

### Custom to Pulse

**Dashboard:** Chart, TopPages, TopReferrers, Locations, TechSpecs, Campaigns, Goals, Performance  
**Settings:** OrganizationSettings, ProfileSettings  
**Sites:** SiteList, VerificationModal  
**Tools:** UtmBuilder  

---

## 📏 Checklist for New Components

When creating new components, ensure:

- [ ] Uses standard color tokens (no hardcoded hex values)
- [ ] Follows typography scale (no custom text sizes)
- [ ] Has dark mode support (`dark:` variants)
- [ ] Includes focus states on interactive elements
- [ ] Uses spacing system (no arbitrary padding values)
- [ ] Follows border radius standards
- [ ] Has empty state if displays lists
- [ ] Has loading state if async
- [ ] Has error state if can fail
- [ ] Responsive on mobile (<768px)
- [ ] Accessible (semantic HTML, ARIA where needed)
- [ ] Consistent with existing components

---

## 🔍 Testing Checklist

Before deploying changes:

### Visual
- [ ] Light mode looks correct
- [ ] Dark mode looks correct
- [ ] Focus rings visible on all interactive elements
- [ ] Typography hierarchy is clear
- [ ] Spacing feels consistent

### Responsive
- [ ] Works on mobile (375px)
- [ ] Works on tablet (768px)
- [ ] Works on desktop (1280px+)

### Accessibility
- [ ] Can navigate with keyboard only
- [ ] Focus visible at all times
- [ ] Screen reader friendly (test with VoiceOver/NVDA)
- [ ] Color contrast passes WCAG AA

### Cross-Browser
- [ ] Chrome/Edge (Chromium)
- [ ] Firefox
- [ ] Safari (macOS/iOS)

---

## 📚 References

- **Tailwind CSS:** https://tailwindcss.com/docs
- **Framer Motion:** https://www.framer.com/motion/
- **WCAG Guidelines:** https://www.w3.org/WAI/WCAG21/quickref/
- **Ciphera Brand:** (internal brand guidelines)

---

## 🔄 Changelog

### v1.0 (2026-02-06)
- Initial design system documentation
- Documented Tier 1 + Tier 2 standardization results
- Defined all component patterns
- Established accessibility standards

---

**This is a living document.** Update as the design system evolves.
