import { ArmitageBrowser } from "./browser-app.js";

Hooks.once("init", () => {
    game.settings.register("armitage", "sections", {
        scope: "world",
        config: false,
        type: Object,
        default: []
    });
});

Hooks.on("renderJournalDirectory", (app, html) => {
    const header = html.querySelector(".directory-header");
    if (!header) return;
    if (header.querySelector(".armitage-open-browser")) return;

    const btn = document.createElement("button");
    btn.className = "armitage-open-browser";
    btn.textContent = "Armitage Browser";
    btn.addEventListener("click", () => {
        new ArmitageBrowser().render(true);
    });
    header.appendChild(btn);
});