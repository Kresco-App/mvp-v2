# Home Dashboard Spacing

Source: Figma home/dashboard screenshot and canonical file `f9ZR9sGl9lZwWxtXbbvvei`.

Implementation:

- `frontend/app/(dashboard)/home/page.tsx`
- `frontend/components/figma/home.tsx`
- `frontend/app/globals.css`

## Desktop Shell

| Token | Value | Reason |
| --- | ---: | --- |
| `home.container.width` | `1408px` | Uses more desktop width so the dashboard is not crowded in the center. |
| `home.container.paddingTop` | `20px` | Reduces the oversized gap below the top nav. |
| `home.grid.main` | `824px` | Keeps the middle dashboard aligned with the permanent sidebar and lets larger subject cards wrap when needed. |
| `home.grid.gap` | `52px` | Separates the permanent sidebar from the main content without pushing it too far right. |
| `home.grid.sidebar` | `351px` | Matches permanent sidebar source node `2024:13568`. |

## Main Content

| Element | Value |
| --- | ---: |
| Main top offset | `32px` |
| Intro heading | `20px` |
| Intro subtitle | `14px` |
| Continue card | `285px x 82px` |
| Continue card gap | `20px` |
| Section heading | `21px` |
| Subject card | `176px x 194px` |
| Subject card grid | `auto-fit`, `20px` gap, exactly five rendered cards |
| Subject icon tile | `66px x 66px` |

## Data Fill

The home subject grid is locked to five canonical dashboard shortcuts: Math, Physics, Philosophy, Biology, and English. Subject names are de-duplicated with aliases, so `Math`, `Maths`, `Mathematics`, and `Mathematiques` count as the same subject.
