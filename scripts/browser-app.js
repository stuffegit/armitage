import { STATE } from "./state.js";
import { escapeHtml } from "./utils.js";
import { loadSections, addSection, updateSection, deleteSection, addSectionEntry, deleteSectionEntry } from "./sections.js";

export class ArmitageBrowser extends foundry.applications.api.HandlebarsApplicationMixin(
    foundry.applications.api.ApplicationV2
) {

    static DEFAULT_OPTIONS = {
        id: "armitage-browser",
        tag: "div",
        classes: ["armitage-browser"],
        window: {
            title: "Armitage Browser",
            width: 1200,
            height: 700,
            resizable: true,
            positioned: true
        }
    };

    static PARTS = {
        main: {
            template: "modules/armitage/templates/browser.html"
        }
    };

    _onRender(context, options) {
        this.#renderSidebar();
        if (STATE.journalId) {
            const journal = game.journal.get(STATE.journalId);
            if (journal) { this.#renderJournalInReader(journal); return; }
            STATE.journalId = null;
        }
        this.#renderMatrix();
    }

    _onFirstRender(context, options) {
        this.#setupDelegation();
        this.#restorePosition();
        this.#observeResize();
    }

    #setupDelegation() {
        this.element.addEventListener("click", (event) => {
            const sectionAction = event.target.closest("[data-section-action]");
            if (sectionAction) { this.#onSectionAction(sectionAction); return; }

            const backBtn = event.target.closest("[data-action=back-to-matrix]");
            if (backBtn) {
                STATE.journalId = null;
                STATE.pageId = null;
                this.#renderMatrix();
                return;
            }

            const entryToggle = event.target.closest("[data-action=toggle-entry]");
            if (entryToggle) {
                this.#onToggleEntry(entryToggle.dataset.id);
                return;
            }

            const entry = event.target.closest("[data-entry-journal-id]");
            if (entry && !event.target.closest("button")) {
                this.#onViewEntry(entry);
                return;
            }

            const pageEntry = event.target.closest(".journal-page");
            if (pageEntry) {
                this.#onPageClick(pageEntry);
            }
        });
    }

    // ── View actions ────────────────────────────────────────────────────

    #onToggleEntry(entryId) {
        const idx = STATE.expandedEntries.indexOf(entryId);
        if (idx === -1) STATE.expandedEntries.push(entryId);
        else STATE.expandedEntries.splice(idx, 1);
        this.#renderMatrix();
    }

    #onViewEntry(el) {
        const journalId = el.dataset.entryJournalId;
        const journal = game.journal.get(journalId);
        if (!journal) return;
        STATE.journalId = journalId;
        STATE.pageId = null;
        this.#renderJournalInReader(journal);
    }

    #onPageClick(entry) {
        const pageId = entry.dataset.pageId;
        const journal = game.journal.get(STATE.journalId);
        if (!journal) return;
        const page = journal.pages.get(pageId);
        if (!page) return;
        STATE.pageId = pageId;

        this.element.querySelectorAll(".journal-page").forEach(el => el.classList.remove("active"));
        entry.classList.add("active");

        const content = this.element.querySelector(".reader-content");
        if (!content) return;

        if (page.type === "text") {
            content.innerHTML = `<h3>${escapeHtml(page.name)}</h3><div class="page-text">${page.text.content}</div>`;
        } else {
            content.innerHTML = `<h3>${escapeHtml(page.name)}</h3><p>${game.i18n.localize("Armitage.PageType")}: ${escapeHtml(page.type)}</p>`;
        }
    }

    #renderJournalInReader(journal) {
        const reader = this.element.querySelector(".reader");
        let html = `<a class="back-link" data-action="back-to-matrix">${game.i18n.localize("Armitage.BackToMatrix")}</a>`;
        html += `<h2>${escapeHtml(journal.name)}</h2>`;
        html += `<div class="reader-pages">`;
        for (const page of journal.pages.contents) {
            html += `<div class="journal-page" data-page-id="${page.id}">${escapeHtml(page.name)}</div>`;
        }
        html += `</div>`;
        html += `<div class="reader-content"></div>`;
        reader.innerHTML = html;
    }

    // ── Window management ───────────────────────────────────────────────

    #restorePosition() {
        this.setPosition({
            width: STATE.windowWidth || 1200,
            height: STATE.windowHeight || 700
        });
    }

    #observeResize() {
        let timer;
        const observer = new ResizeObserver(([entry]) => {
            clearTimeout(timer);
            timer = setTimeout(() => {
                const { width, height } = entry.contentRect;
                const w = Math.round(width);
                const h = Math.round(height);
                if (w >= 400 && h >= 300 && w <= 5000 && h <= 5000) {
                    STATE.windowWidth = w;
                    STATE.windowHeight = h;
                }
            }, 300);
        });
        observer.observe(this.element);
    }

    // ── Sidebar ─────────────────────────────────────────────────────────

    #renderSidebar() {
        const sidebar = this.element.querySelector(".sidebar");
        if (!sidebar) return;
        const sections = loadSections();

        let html = `<div class="sections-header">
            <h2>${game.i18n.localize("Armitage.Sections")}</h2>
            <button class="icon-btn" data-section-action="add-section" title="${game.i18n.localize("Armitage.AddSection")}"><i class="fas fa-plus"></i></button>
        </div>`;

        const sorted = [...sections].sort((a, b) => a.sort - b.sort);
        if (sorted.length > 0) {
            html += `<div class="section-list">`;
            for (const s of sorted) {
                html += this.#renderSidebarSectionCard(s);
            }
            html += `</div>`;
        } else {
            html += `<p class="empty-message">${game.i18n.localize("Armitage.NoSections")}</p>`;
        }

        sidebar.innerHTML = html;
    }

    #renderSidebarSectionCard(section) {
        return `
            <div class="sidebar-section" style="border-left: 3px solid ${section.color}">
                <span class="sidebar-section-name">${escapeHtml(section.name)}</span>
                <div class="sidebar-section-actions">
                    <button data-section-action="edit-section" data-id="${section.id}" title="${game.i18n.localize("Armitage.EditSection")}"><i class="fas fa-pen"></i></button>
                    <button data-section-action="delete-section" data-id="${section.id}" title="${game.i18n.localize("Armitage.DeleteSection")}"><i class="fas fa-trash"></i></button>
                </div>
            </div>
        `;
    }

    // ── Matrix ──────────────────────────────────────────────────────────

    #renderMatrix() {
        const reader = this.element.querySelector(".reader");
        if (!reader) return;
        const sections = loadSections();
        const sorted = [...sections].sort((a, b) => a.sort - b.sort);

        if (sorted.length === 0) {
            reader.innerHTML = `<div class="reader-empty"><p>${game.i18n.localize("Armitage.MatrixEmpty")}</p></div>`;
            return;
        }

        let html = `<div class="matrix-columns">`;
        for (const section of sorted) {
            html += this.#renderSectionColumn(section);
        }
        html += `</div>`;
        reader.innerHTML = html;
    }

    #renderSectionColumn(section) {
        const entries = section.entries || [];
        const roots = entries.filter(e => !e.parentId).sort((a, b) => a.sort - b.sort);

        let html = `<div class="section-column" style="border-top: 2px solid ${section.color}">`;
        html += `<div class="column-header">
            <h3>${escapeHtml(section.name)}</h3>
            <div class="column-actions">
                <button class="icon-btn" data-section-action="add-collection" data-id="${section.id}" title="${game.i18n.localize("Armitage.AddCollection")}"><i class="fas fa-folder"></i></button>
                <button class="icon-btn" data-section-action="add-journal" data-id="${section.id}" title="${game.i18n.localize("Armitage.AddJournal")}"><i class="fas fa-book"></i></button>
            </div>
        </div>`;

        if (roots.length > 0) {
            html += `<div class="column-tree">`;
            for (const entry of roots) {
                html += this.#renderEntry(entry, entries, section.id, 0);
            }
            html += `</div>`;
        } else {
            html += `<div class="column-empty">${game.i18n.localize("Armitage.ColumnEmpty")}</div>`;
        }

        html += `</div>`;
        return html;
    }

    #renderEntry(entry, allEntries, sectionId, depth) {
        const children = allEntries.filter(e => e.parentId === entry.id).sort((a, b) => a.sort - b.sort);
        const isExpanded = STATE.expandedEntries.includes(entry.id);
        const hasChildren = children.length > 0;

        let html = `<div class="entry-row" style="padding-left: ${depth * 16}px">`;

        if (entry.type === "collection") {
            html += `<span class="entry-toggle ${hasChildren ? "" : "entry-toggle-empty"}" data-action="toggle-entry" data-id="${entry.id}">${hasChildren ? (isExpanded ? "▾" : "▸") : ""}</span>`;
            html += `<span class="entry-name entry-collection">${escapeHtml(entry.name)}</span>`;
            html += `<button class="entry-add-child" data-section-action="add-journal" data-id="${sectionId}" data-parent-id="${entry.id}" title="${game.i18n.localize("Armitage.AddJournal")}"><i class="fas fa-plus"></i></button>`;
        } else {
            html += `<span class="entry-toggle entry-toggle-empty"></span>`;
            html += `<span class="entry-name entry-journal" data-entry-journal-id="${entry.journalId}" data-entry-id="${entry.id}">${escapeHtml(entry.name)}</span>`;
        }

        html += `<button class="entry-delete" data-section-action="delete-entry" data-section-id="${sectionId}" data-entry-id="${entry.id}" title="${game.i18n.localize("Armitage.DeleteEntry")}"><i class="fas fa-times"></i></button>`;
        html += `</div>`;

        if (hasChildren && isExpanded) {
            for (const child of children) {
                html += this.#renderEntry(child, allEntries, sectionId, depth + 1);
            }
        }

        return html;
    }

    // ── Section actions ─────────────────────────────────────────────────

    #onSectionAction(btn) {
        const action = btn.dataset.sectionAction;
        if (action === "add-section") this.#showAddSectionDialog();
        else if (action === "edit-section") this.#showEditSectionDialog(btn.dataset.id);
        else if (action === "delete-section") this.#showDeleteSectionDialog(btn.dataset.id);
        else if (action === "add-collection") this.#showAddCollectionDialog(btn.dataset.id);
        else if (action === "add-journal") this.#showAddJournalDialog(btn.dataset.id, btn.dataset.parentId || null);
        else if (action === "delete-entry") this.#showDeleteEntryDialog(btn.dataset.sectionId, btn.dataset.entryId);
    }

    // ── Section dialogs ─────────────────────────────────────────────────

    #showAddSectionDialog() {
        const content = `
            <form>
                <div class="form-group">
                    <label>${game.i18n.localize("Armitage.SectionName")}</label>
                    <input type="text" name="name" autofocus />
                </div>
                <div class="form-group">
                    <label>${game.i18n.localize("Armitage.SectionColor")}</label>
                    <input type="color" name="color" value="#aa66cc" />
                </div>
            </form>
        `;
        new foundry.applications.api.DialogV2({
            window: { title: game.i18n.localize("Armitage.AddSection") },
            content,
            buttons: [{
                action: "create",
                label: game.i18n.localize("Armitage.Create"),
                default: true,
                callback: (event, button, dialog) => {
                    const f = button.form;
                    const name = f.querySelector("[name=name]").value.trim();
                    const color = f.querySelector("[name=color]").value;
                    if (name) {
                        addSection(name, { color }).then(() => {
                            this.#renderSidebar();
                            this.#renderMatrix();
                        });
                    }
                    return { name, color };
                }
            }]
        }).render({ force: true });
    }

    #showEditSectionDialog(id) {
        const sections = loadSections();
        const section = sections.find(s => s.id === id);
        if (!section) return;

        const content = `
            <form>
                <div class="form-group">
                    <label>${game.i18n.localize("Armitage.SectionName")}</label>
                    <input type="text" name="name" value="${escapeHtml(section.name)}" autofocus />
                </div>
                <div class="form-group">
                    <label>${game.i18n.localize("Armitage.SectionColor")}</label>
                    <input type="color" name="color" value="${section.color}" />
                </div>
            </form>
        `;
        new foundry.applications.api.DialogV2({
            window: { title: game.i18n.localize("Armitage.EditSection") },
            content,
            buttons: [{
                action: "save",
                label: game.i18n.localize("Armitage.Save"),
                default: true,
                callback: (event, button, dialog) => {
                    const f = button.form;
                    const name = f.querySelector("[name=name]").value.trim();
                    const color = f.querySelector("[name=color]").value;
                    if (name) {
                        updateSection(id, { name, color }).then(() => {
                            this.#renderSidebar();
                            this.#renderMatrix();
                        });
                    }
                    return { name, color };
                }
            }]
        }).render({ force: true });
    }

    async #showDeleteSectionDialog(id) {
        const sections = loadSections();
        const section = sections.find(s => s.id === id);
        if (!section) return;

        const proceed = await foundry.applications.api.DialogV2.confirm({
            window: { title: game.i18n.localize("Armitage.DeleteSection") },
            content: `<p>${game.i18n.localize("Armitage.ConfirmDelete")} <strong>${escapeHtml(section.name)}</strong>?</p>`,
            modal: true,
            rejectClose: false
        });
        if (!proceed) return;
        await deleteSection(id);
        this.#renderSidebar();
        this.#renderMatrix();
    }

    // ── Entry dialogs ───────────────────────────────────────────────────

    #showAddCollectionDialog(sectionId) {
        const content = `
            <form>
                <div class="form-group">
                    <label>${game.i18n.localize("Armitage.CollectionName")}</label>
                    <input type="text" name="name" autofocus />
                </div>
            </form>
        `;
        new foundry.applications.api.DialogV2({
            window: { title: game.i18n.localize("Armitage.AddCollection") },
            content,
            buttons: [{
                action: "create",
                label: game.i18n.localize("Armitage.Create"),
                default: true,
                callback: (event, button) => {
                    const name = button.form.querySelector("[name=name]").value.trim();
                    if (name) {
                        addSectionEntry(sectionId, { name, type: "collection", journalId: null, parentId: null }).then(() => this.#renderMatrix());
                    }
                    return { name };
                }
            }]
        }).render({ force: true });
    }

    #showAddJournalDialog(sectionId, parentId) {
        const sections = loadSections();
        const section = sections.find(s => s.id === sectionId);
        if (!section) return;

        const journals = game.journal.contents;
        const journalOptions = journals.map(j =>
            `<option value="${j.id}">${escapeHtml(j.name)}</option>`
        ).join("");

        const content = `
            <form>
                <div class="form-group">
                    <label>${game.i18n.localize("Armitage.EntryJournal")}</label>
                    <select name="journalId" autofocus>
                        ${journalOptions}
                    </select>
                </div>
            </form>
        `;
        new foundry.applications.api.DialogV2({
            window: { title: `${game.i18n.localize("Armitage.AddJournal")}: ${section.name}` },
            content,
            buttons: [{
                action: "add",
                label: game.i18n.localize("Armitage.Add"),
                default: true,
                callback: (event, button) => {
                    const journalId = button.form.querySelector("[name=journalId]").value;
                    const journal = game.journal.get(journalId);
                    if (journal) {
                        addSectionEntry(sectionId, { name: journal.name, type: "journal", journalId, parentId }).then(() => this.#renderMatrix());
                    }
                    return { journalId, parentId };
                }
            }]
        }).render({ force: true });
    }

    async #showDeleteEntryDialog(sectionId, entryId) {
        const sections = loadSections();
        const section = sections.find(s => s.id === sectionId);
        if (!section) return;
        const entry = (section.entries || []).find(e => e.id === entryId);
        if (!entry) return;

        const proceed = await foundry.applications.api.DialogV2.confirm({
            window: { title: game.i18n.localize("Armitage.DeleteEntry") },
            content: `<p>${game.i18n.localize("Armitage.ConfirmDelete")} <strong>${escapeHtml(entry.name)}</strong>?</p>`,
            modal: true,
            rejectClose: false
        });
        if (!proceed) return;
        await deleteSectionEntry(sectionId, entryId);
        this.#renderMatrix();
    }

}
