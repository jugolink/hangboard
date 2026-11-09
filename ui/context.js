// The per-photo context menu front end.
//
// The window is shown by Rust (via `open_context`), and each button calls a
// thin `context_*` command. Rust knows which photo is the subject through
// `state.context_id`, so the buttons never carry an id themselves.

const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;

const ACTION = {
  copy: "context_copy",
  open: "context_open",
  preview: "open_preview", // handled below, needs the id
  markup: null, // not implemented yet (PR #11)
  reveal: "context_reveal",
  export: "context_export",
  discard: "context_discard",
  "discard-left": "context_discard_left",
  "discard-right": "context_discard_right",
};

async function run(action) {
  if (action === "preview") {
    // Open the preview for the current context item. The id lives in Rust, so
    // route through a dedicated command that also closes this menu.
    await invoke("context_preview");
    return;
  }
  if (action === "markup") {
    return; // PR #11
  }
  if (!ACTION[action]) return;
  await invoke(ACTION[action]);
}

document.querySelectorAll("#menu button").forEach((button) => {
  button.addEventListener("click", () => {
    void run(button.dataset.action);
  });
});

// Close when the pointer clicks anywhere else on the line, or on Escape.
window.addEventListener("blur", () => {
  void invoke("close_context");
});

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    void invoke("close_context");
  }
});
