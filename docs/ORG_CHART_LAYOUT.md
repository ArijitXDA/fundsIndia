# Organization Chart - Vertical Tree Layout

## New Tree Structure

The organization chart now displays as a proper **vertical tree** similar to traditional organizational diagrams.

### Visual Layout

```
                    ┌─────────────────┐
                    │  Akshay Sapru   │
                    │   Group CEO     │
                    └────────┬────────┘
                             │
         ┌───────────────────┼───────────────────┐
         │                   │                   │
    ┌────┴────┐         ┌────┴────┐         ┌────┴────┐
    │ CEO-B2B │         │ CEO-B2C │         │ CEO-PW  │
    └────┬────┘         └────┬────┘         └────┬────┘
         │                   │                   │
    ┌────┴────┐         ┌────┴────┐         ┌────┴────┐
    │ Zonal   │         │Regional │         │Regional │
    │  Head   │         │ Manager │         │ Manager │
    └────┬────┘         └────┬────┘         └────┬────┘
         │                   │                   │
    ┌────┴────┐         ┌────┴────┐         ┌────┴────┐
    │ Branch  │         │ Team    │         │ Team    │
    │ Manager │         │ Lead    │         │ Lead    │
    └────┬────┘         └─────────┘         └─────────┘
         │
    ┌────┴────┐
    │   RM    │ ⭐ YOU
    └─────────┘
```

## Key Features

### 1. Hierarchical Tree Structure
- **Top Level**: CEO at the top center
- **Each Level**: Managers/employees displayed horizontally
- **Siblings**: Team members at same level shown side-by-side
- **Vertical Flow**: Organization flows from top to bottom

### 2. Connecting Lines
- **Vertical Lines**: Connect parent to children level
- **Horizontal Lines**: Connect siblings at same level
- **T-Junctions**: Show branching in hierarchy
- **Clear Paths**: Visual path from CEO to any employee

### 3. Card Layout
- **Compact Design**: 320-380px wide cards
- **Essential Info Only**: Name, designation, business unit, performance
- **Clickable Links**: Phone and email
- **Expand/Collapse**: Arrows on manager cards

### 4. Scrolling Behavior
- **Horizontal Scroll**: When team is wider than screen
- **Vertical Scroll**: When hierarchy is taller than screen
- **Smooth Pan**: Navigate large org structures easily
- **Centered View**: Tree centers in viewport

## Employee Card Details

### Card Contents
```
┌─────────────────────────────────┐
│ Amarnath Sahu              [↓]  │ ← Name + Expand arrow
│ ────────────────────────────── │
│ 📊 Relationship Manager • B2B  │ ← Designation + BU
│ 📈 ₹70.35 Cr YTD              │ ← Performance
│ 📞 91-88826 51719             │ ← Phone (clickable)
│ ✉️  amarnath@fundsindia.com   │ ← Email (clickable)
│ ────────────────────────────── │
│ 👥 5 Direct Reports           │ ← Team size
└─────────────────────────────────┘
```

### Current User Highlight
```
┌═════════════════════════════════┐
║ Amarnath Sahu    [YOU]     [↓] ║ ← Purple gradient
║ ═══════════════════════════════ ║
║ 📊 Relationship Manager • B2B   ║
║ 📈 ₹70.35 Cr YTD               ║
║ ...                             ║
╚═════════════════════════════════╝
       ↑ Indigo ring highlight
```

## Expand/Collapse Behavior

### Collapsed State
```
┌─────────────┐
│ Manager [↓] │ ← Down arrow = Can expand
└─────────────┘
```

### Expanded State
```
┌─────────────┐
│ Manager [↑] │ ← Up arrow = Can collapse
└──────┬──────┘
       │
  ┌────┼────┐
  │    │    │
┌─┴─┐ ┌┴─┐ ┌┴─┐
│ A │ │B│ │C│ ← Direct reports visible
└───┘ └──┘ └──┘
```

## Layout Calculations

### Spacing
- **Vertical Gap (Parent to Child)**: 8px line + 6px margin = 14px total
- **Horizontal Gap (Siblings)**: 24px (gap-6)
- **Card Width**: 320-380px (responsive based on content)
- **Line Thickness**: 0.5px (thin, subtle lines)

### Horizontal Line Width
For N children at same level:
```
Width = (N - 1) × 400px
```

Example:
- 1 child: No horizontal line needed
- 2 children: 400px line
- 3 children: 800px line
- 5 children: 1600px line

### Centering Logic
```css
.tree-container {
  display: flex;
  justify-content: center;  /* Centers entire tree */
  min-width: max-content;   /* Allows horizontal scroll */
}
```

## Responsive Design

### Large Teams (10+ members)
- Horizontal scrolling activates
- Maintains card sizes
- Clear visual connection lines
- Smooth scroll experience

### Deep Hierarchies (6+ levels)
- Vertical scrolling activates
- Full tree visible with scroll
- Path to current user auto-expanded
- Zoom capability via browser

### Small Screens
- Modal fills viewport (95vw × 95vh)
- Touch-friendly scroll
- Card sizes maintained
- All features accessible

## Performance Optimizations

### Lazy Rendering
- Only expanded nodes render children
- Collapsed teams don't render cards
- Improves performance for large orgs

### Efficient Updates
- React state for expand/collapse
- Minimal re-renders
- Smooth animations

### Memory Management
- Virtual scrolling not needed (collapsed nodes handle this)
- Clean component unmounting
- No memory leaks

## User Interaction Flow

1. **Open Modal**: Click "Org View" button
2. **Initial View**: Tree starts at top CEO
3. **Auto-Expand**: Path to current user already expanded
4. **Current User**: Highlighted card with purple gradient
5. **Navigate**:
   - Click ↓ to expand a manager's team
   - Click ↑ to collapse team
   - Scroll horizontally for wide teams
   - Scroll vertically for deep hierarchies
6. **Interact**:
   - Click phone numbers to call
   - Click emails to compose
   - View YTD performance for each person
7. **Close**: X button or Close button in footer

## Advantages Over Previous Layout

### Before (Stacked Cards with Indentation)
- ❌ Hard to see sibling relationships
- ❌ Indentation used too much horizontal space
- ❌ Unclear team structure
- ❌ No visual connection lines

### After (Vertical Tree)
- ✅ Clear parent-child relationships
- ✅ Siblings visually grouped together
- ✅ Traditional org chart layout
- ✅ Visual connection lines
- ✅ Better space utilization
- ✅ Easier to understand hierarchy

## Browser Compatibility

| Browser | Support | Notes |
|---------|---------|-------|
| Chrome 90+ | ✅ Full | Recommended |
| Firefox 88+ | ✅ Full | Works perfectly |
| Safari 14+ | ✅ Full | Good performance |
| Edge 90+ | ✅ Full | Chromium-based |
| Mobile Safari | ✅ Good | Touch scroll works |
| Mobile Chrome | ✅ Good | Touch scroll works |

## Future Enhancements

### Potential Additions
- **Zoom Controls**: +/- buttons to zoom tree
- **Mini-map**: Small overview of entire tree
- **Search**: Jump to any employee
- **Export**: Download as PNG/PDF
- **Filters**: Show only specific departments
- **Animations**: Smooth expand/collapse transitions
- **Drag to Pan**: Alternative to scrollbars
- **Tooltips**: Hover for additional info
