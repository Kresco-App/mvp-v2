# Dashboard Shell Alignment

Source: Kresco Figma dashboard/navigation frames.

These values define the reusable outer rails used by pages that show the permanent sidebar.

| Token | Value | Use |
| --- | ---: | --- |
| `--figma-shell-width` | `1504px` | Shared max width for top nav and dashboard pages |
| `--figma-shell-gutter` | `32px` | Left/right inset; page content aligns with the Kresco wordmark rail |
| `--figma-main-column` | `1077px` | Main content column when the permanent sidebar is present |
| `--figma-sidebar-width` | `351px` | Permanent sidebar card width |
| `--figma-sidebar-gap` | `12px` | Gap between main content and sidebar |

Rules:

- `TopNav`, `.figma-home-container`, `.figma-courses-container`, and `.figma-container` must use the same shell width and gutter.
- Pages with the permanent sidebar should use `.figma-dashboard-grid`, `.figma-home-grid`, or `.figma-courses-grid`; those classes share the same sidebar rail.
- Page-specific spacing can happen inside the main column, but not by changing the outer shell or sidebar grid.
