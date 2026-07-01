# Armitage

A Foundry VTT module providing a multi-column tree journal manager for investigation-heavy games (Delta Green, Call of Cthulhu, etc.).

## File Map

```
module.json          — Module manifest (id, version, compatibility 13-14)
languages/en.json    — All user-facing strings (Armitage.* keys)
templates/browser.html — Single-root Handlebars template for the app shell
styles/armitage.css  — All styles (scoped under .armitage-browser)
scripts/
  armitage.js        — Entry point: registers settings, hooks into Journal Directory
  browser-app.js     — Main ApplicationV2 class (handles everything)
  sections.js        — Data model + CRUD for sections and their entry trees
  state.js           — In-memory singleton for transient UI state
  utils.js           — escapeHtml helper
```

## Architecture

### Application Entry Point

`armitage.js` registers one world-scoped setting (`"sections"`) and hooks `renderJournalDirectory` to inject an "Armitage Browser" button into the sidebar. Clicking the button creates a new `ArmitageBrowser` instance and renders it.

### Main Application — `ArmitageBrowser`

```
class ArmitageBrowser extends HandlebarsApplicationMixin(ApplicationV2)
```

**Lifecycle:**
1. `_onRender(context, options)` — Called on every render. Reads sections from settings, renders sidebar and matrix (or restores journal view from `STATE`).
2. `_onFirstRender(context, options)` — Called once. Sets up click delegation, restores window position, starts ResizeObserver.
3. Subsequent renders — trigger `_onRender` again (e.g., after dialog actions via `this.#renderMatrix()` / `this.#renderSidebar()`).

**Responsibility:** Everything. There are no sub-components or child classes. The app renders all HTML via template literals (no Handlebars partials), handles all interactions through a single delegated click handler, and manages all dialogs inline.

### Data Layer

All data lives in `game.settings` under the `"armitage"` key, persisted world-wide as JSON.

```
game.settings
  └─ "armitage"."sections" : Section[]
```

**Section schema** (`sections.js`):
```ts
interface Section {
  id: string;           // foundry.utils.randomID()
  name: string;
  color: string;        // hex color
  description: string;
  sort: number;
  entries: SectionEntry[];
}
```

**SectionEntry schema**:
```ts
interface SectionEntry {
  id: string;           // foundry.utils.randomID()
  name: string;          // display name (for journals: derived from the Journal document)
  type: "collection" | "journal";
  journalId: string | null;  // UUID of a Journal entry (only for type="journal")
  parentId: string | null;   // links to parent collection's id
  sort: number;
}
```

**Data flow:**
```
game.settings (JSON) → loadSections() → deep clone via parse/stringify
                                          ↓
                                   ArmitageBrowser
                                          ↓
                                   this.#renderMatrix()
                                   this.#renderSidebar()
                                          ↓
                                   user actions (dialogs)
                                          ↓
                                   addSectionEntry() / etc.
                                          ↓
                                   game.settings.set() (await)
                                          ↓
                                   this.#renderMatrix() (re-render)
```

The deep clone (`JSON.parse(JSON.stringify(data))`) ensures mutations in the render path never corrupt the source data.

### State — `STATE` (`state.js`)

Module-level singleton. Lives only for the current page session (resets on refresh). Not persisted.

```ts
const STATE = {
  journalId: string | null,   // currently viewed journal (drills into reader mode)
  pageId: string | null,       // currently viewed page within that journal
  windowWidth: number,
  windowHeight: number,
  expandedEntries: string[]    // ids of expanded collection rows
};
```

### Rendering

All HTML is built via string concatenation in template literal methods, then set via `.innerHTML`. No Handlebars partials. Each render method returns a string fragment:

```
#renderMatrix()
  └─ #renderSectionColumn(section)
       ├─ column header (name + action buttons)
       └─ #renderEntry(entry, allEntries, sectionId, depth)
            ├─ collection type → toggle, bold name, +Journal button, × button
            └─ journal type → clickable reference, × button
            └─ (recursive) children if expanded

#renderSidebar()
  └─ #renderSidebarSectionCard(section)
```

### Event Handling

Single delegated `click` listener on `this.element` in `#setupDelegation()`. Checks `event.target.closest()` for each data attribute in priority order:

1. `[data-section-action]` → CRUD actions (add/edit/delete section, add collection, add journal, delete entry)
2. `[data-action=back-to-matrix]` → return from journal view
3. `[data-action=toggle-entry]` → expand/collapse collection
4. `[data-entry-journal-id]` (no button ancestor) → view journal
5. `.journal-page` → view journal page

### Dialogs

All dialogs use `foundry.applications.api.DialogV2`. Two patterns:

### DialogV2 Patterns

**Form dialog** (add/edit section, add collection, add journal):

```js
new DialogV2({
  window: { title: "..." },
  content: `<form>...</form>`,
  buttons: [{
    action: "...",
    label: "...",
    default: true,
    callback: (event, button) => {
      // Synchronous. Read form values, fire async work, return result.
      addSectionEntry(id, data).then(() => this.#renderMatrix());
      return formData;
    }
  }]
}).render({ force: true });
```

**Confirm dialog** (delete operations):

```js
const proceed = await DialogV2.confirm({
  window: { title: "..." },
  content: `...`,
  modal: true,
  rejectClose: false
});
if (!proceed) return;
// do delete
```

**Why synchronous callbacks:** `DialogV2.submit` is typed `void` and may not `await` async callbacks. All async work (data save + re-render) is fired from the synchronous `callback` handler via `.then()` chains, not from `submit`.

### CSS Conventions

- All selectors prefixed with `.armitage-browser` to scope within the app.
- ApplicationV2 wraps the template in a `.window-content` div. **Direct child selectors (`>`) cannot target template elements.** All selectors use descendant combinators instead.
- Layout: `.armitage-layout` is a horizontal flex row containing `.sidebar` (fixed 220px) and `.reader` (flex: 1).
- Matrix columns: `.matrix-columns` is a horizontal flex row of `.section-column` cards.
- Entry rows: `.entry-row` is a horizontal flex row with toggle, name, optional add-child button, and hover-reveal delete button.
- Collection names use `.entry-collection` (bold), journal names use `.entry-journal` (clickable, blue on hover).

## Key Design Decisions

- **No sub-component classes.** The app is a single class that renders everything. Keeps things simple for the initial implementation. If complexity grows, rendering could be extracted into separate renderer modules.
- **Settings for persistence.** `game.settings` with `scope: "world"` means all GMs share the same data (no per-user views). The deep-clone pattern prevents stale references.
- **STATE for transient UI state only.** Window size and expanded entries are in-memory and reset on reload. Intentional — no need to persist scroll position or open/closed states.
- **No drag-and-drop yet.** Adding entries to collections is done via context buttons. DnD can be added later.
- **String building over templating.** All HTML is built with template literals. This avoids the overhead of compiling Handlebars partials for dynamically-generated trees. If the tree rendering becomes more complex, a dedicated renderer module would extract the template logic.

## Future Direction

- Drag-and-drop for entries within and between sections.
- Edit entry dialog (currently only add and delete exist).
- Custom order sorting (drag to reorder).
- User-scoped settings for per-user views.
- Additional section metadata (tags, notes, etc.).
