# Avatar Account Button

**Date:** 2026-04-08
**Status:** Approved

## Overview

Replace the current `User` icon button in the navbar with a circular avatar button showing the user's initials. The initials are derived from `display_name` and coloured by a deterministic hash — same name always maps to the same hue. No photo/avatar is used; initials is the only state.

## Visual Design

### Button

- Shape: circle, 36×36px (`w-9 h-9`)
- Content: double initials — first character of word 1 + first character of word 2 from `display_name` (e.g. "Will Loveland" → "WL"); single initial if only one word
- Typography: `text-xs font-semibold tracking-wide`
- Hover: `hover:ring-2 hover:ring-slate-500`
- Focus visible: `focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:outline-none`
- Transition: `transition-shadow`

### Colour palette (name-hashed)

Six curated dark-theme hues. `display_name` is hashed (sum of char codes mod 6) to an index:

| Index | Background  | Border      | Text        | Tailwind label |
|-------|-------------|-------------|-------------|----------------|
| 0     | `#1e1b4b`   | `#4f46e5`   | `#a5b4fc`   | indigo         |
| 1     | `#1e3a5f`   | `#2563eb`   | `#93c5fd`   | blue           |
| 2     | `#2e1065`   | `#7c3aed`   | `#c4b5fd`   | violet         |
| 3     | `#0d2b2b`   | `#0d9488`   | `#5eead4`   | teal           |
| 4     | `#2d0a16`   | `#e11d48`   | `#fda4af`   | rose           |
| 5     | `#0c2233`   | `#0284c7`   | `#7dd3fc`   | sky            |

Colours are applied as inline styles (not Tailwind classes) since they are dynamically selected at runtime.

## Data

- No API changes required.
- `display_name` is already returned by `/api/auth/me` and stored in `displayName` state in `Navbar`.
- Initials and colour are derived entirely client-side from the existing `displayName` string.

## Utilities (`lib/utils.ts`)

### `getInitials(name: string): string`

- Trim and split on whitespace
- Return `words[0][0].toUpperCase() + words[1][0].toUpperCase()` if two or more words
- Return `words[0][0].toUpperCase()` if one word
- Return `""` if empty string

### `getAvatarColor(name: string): { bg: string; border: string; text: string }`

- Sum char codes of `name`, mod 6 to get palette index
- Return the corresponding `{ bg, border, text }` hex values from the palette above

## Component (`components/ui/AvatarButton.tsx`)

```
interface AvatarButtonProps {
  name: string
  onClick?: () => void
  className?: string
}
```

- Renders a `<button>` with the circle styles, initials, and colour applied via inline `style`
- Accepts `className` for any wrapper-level overrides
- No internal dropdown logic — it is purely a trigger

## Navbar changes (`components/ui/navbar.tsx`)

### Desktop

Replace:
```tsx
<Button variant="outline" size="sm">
  <User className="size-4" />
</Button>
```

With `<AvatarButton name={displayName ?? ''} />` as the `DropdownMenuTrigger` child.

### Mobile

Replace:
```tsx
<Button variant="outline" size="icon" className="shrink-0">
  <User className="size-4" />
</Button>
```

With `<AvatarButton name={displayName ?? ''} />` as the `SheetTrigger` child.

### Loading / logged-out state

When `user` is null the button is not shown (existing behaviour unchanged). When `displayName` is null but `user` is set (edge case during fetch), render `AvatarButton` with `name=""` — it will show a single fallback initial or empty circle.

## Out of scope

- Google avatar / photo upload — deferred to a future settings feature
- Profile photo management in Account Settings
