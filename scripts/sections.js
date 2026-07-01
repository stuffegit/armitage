const SECTIONS_KEY = "sections";

function getData() {
    try {
        const data = game.settings.get("armitage", SECTIONS_KEY);
        return data ? JSON.parse(JSON.stringify(data)) : [];
    } catch {
        return [];
    }
}

async function setData(data) {
    await game.settings.set("armitage", SECTIONS_KEY, data);
}

export async function addSection(name, options = {}) {
    const sections = getData();
    const section = {
        id: foundry.utils.randomID(),
        name,
        color: options.color || "#aa66cc",
        description: options.description || "",
        sort: sections.length
    };
    sections.push(section);
    await setData(sections);
    return section;
}

export async function updateSection(id, changes) {
    const sections = getData();
    const idx = sections.findIndex(s => s.id === id);
    if (idx === -1) return;
    sections[idx] = { ...sections[idx], ...changes };
    await setData(sections);
}

export async function deleteSection(id) {
    let sections = getData();
    sections = sections.filter(s => s.id !== id);
    await setData(sections);
}

export function loadSections() {
    return getData();
}

// ── Entry tree CRUD ─────────────────────────────────────────────────────

export async function addSectionEntry(sectionId, entry) {
    const sections = getData();
    const section = sections.find(s => s.id === sectionId);
    if (!section) return;
    section.entries = section.entries || [];
    const newEntry = {
        id: foundry.utils.randomID(),
        name: entry.name,
        type: entry.type || "journal",
        journalId: entry.journalId || null,
        parentId: entry.parentId || null,
        sort: section.entries.length
    };
    section.entries.push(newEntry);
    await setData(sections);
    return newEntry;
}

export async function updateSectionEntry(sectionId, entryId, changes) {
    const sections = getData();
    const section = sections.find(s => s.id === sectionId);
    if (!section) return;
    const idx = (section.entries || []).findIndex(e => e.id === entryId);
    if (idx === -1) return;
    section.entries[idx] = { ...section.entries[idx], ...changes };
    await setData(sections);
}

export async function deleteSectionEntry(sectionId, entryId) {
    const sections = getData();
    const section = sections.find(s => s.id === sectionId);
    if (!section) return;
    section.entries = (section.entries || []).filter(e => e.id !== entryId && e.parentId !== entryId);
    await setData(sections);
}

export function getSectionEntries(sectionId) {
    const sections = getData();
    const section = sections.find(s => s.id === sectionId);
    return section ? (section.entries || []) : [];
}
