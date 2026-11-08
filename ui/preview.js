// The preview lightbox front end.
//
// The Rust side owns which photo is current (state.preview_index). This file
// never trusts a stale event: on boot and after every step it pulls the
// authoritative index, image and count straight from Rust, so the very first
// frame is correct even if the window is shown before any event could arrive.

const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;

const photo = document.getElementById("photo");
const counter = document.getElementById("counter");

async function refresh() {
  const index = await invoke("preview_index");
  // null means the preview is closed; leave the last frame, Rust hid us.
  if (index === null || index === undefined) return;

  const url = await invoke("preview_image");
  const items = await invoke("list_items");

  if (url) photo.src = url;
  const count = Array.isArray(items) ? items.length : 0;
  counter.textContent = count > 0 ? `${index + 1} / ${count}` : "";
}

async function step(delta) {
  await invoke("step_preview", { delta });
  await refresh();
}

async function close() {
  await invoke("close_preview");
}

async function boot() {
  await listen("preview:show", () => void refresh());

  await refresh();

  window.addEventListener("keydown", async (event) => {
    if (event.repeat) return;
    if (event.key === "Escape" || event.key === " ") {
      event.preventDefault();
      await close();
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      await step(-1);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      await step(1);
    }
  });

  // A keyup Space would otherwise scroll the page; there is nothing to scroll
  // but suppressing it keeps the event from leaking anywhere else.
  window.addEventListener("keyup", (event) => {
    if (event.key === " ") event.preventDefault();
  });
}

boot().catch((error) => console.error("hangboard: preview boot failed", error));
