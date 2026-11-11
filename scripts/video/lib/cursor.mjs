/**
 * CDP screencast does not contain the OS pointer, so the take draws its own.
 * Injected with `addInitScript` so it survives every page navigation.
 */
const CURSOR_SCRIPT = `
(() => {
  if (window.__geoShieldCursorInstalled) return;
  window.__geoShieldCursorInstalled = true;

  const ARROW = '<svg width="26" height="26" viewBox="0 0 26 26" xmlns="http://www.w3.org/2000/svg">' +
    '<path d="M4 2.5 L4 20.5 L8.6 16.2 L11.6 23.4 L15.1 21.9 L12.1 14.8 L18.6 14.2 Z" ' +
    'fill="#ffffff" stroke="#0f172a" stroke-width="1.6" stroke-linejoin="round"/></svg>';

  function mount() {
    if (document.getElementById("__geoshield_cursor")) return;
    const cursor = document.createElement("div");
    cursor.id = "__geoshield_cursor";
    cursor.style.cssText = [
      "position:fixed", "left:0", "top:0", "width:26px", "height:26px",
      "pointer-events:none", "z-index:2147483647", "will-change:transform",
      "transform:translate3d(960px,540px,0)", "transition:transform 60ms linear",
      "filter:drop-shadow(0 2px 3px rgba(0,0,0,.45))", "opacity:0"
    ].join(";");
    cursor.innerHTML = ARROW;
    document.documentElement.appendChild(cursor);

    const style = document.createElement("style");
    style.textContent =
      "@keyframes __gsRipple{0%{transform:scale(.25);opacity:.95}100%{transform:scale(2.6);opacity:0}}" +
      ".__gs_ripple{position:fixed;width:34px;height:34px;margin:-17px 0 0 -17px;border-radius:50%;" +
      "border:3px solid rgba(56,189,248,.95);background:rgba(56,189,248,.18);pointer-events:none;" +
      "z-index:2147483646;animation:__gsRipple 520ms ease-out forwards}";
    document.head.appendChild(style);

    let visible = false;
    window.addEventListener("mousemove", (e) => {
      cursor.style.transform = "translate3d(" + e.clientX + "px," + e.clientY + "px,0)";
      if (!visible) { cursor.style.opacity = "1"; visible = true; }
    }, { passive: true });

    window.addEventListener("mousedown", (e) => {
      const ripple = document.createElement("div");
      ripple.className = "__gs_ripple";
      ripple.style.left = e.clientX + "px";
      ripple.style.top = e.clientY + "px";
      document.documentElement.appendChild(ripple);
      setTimeout(() => ripple.remove(), 560);
    }, { passive: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount, { once: true });
  } else {
    mount();
  }
})();
`;

export async function installCursor(page) {
  await page.addInitScript({ content: CURSOR_SCRIPT });
}

/** Move the synthetic pointer to a locator with a human-ish, stepped path. */
export async function moveTo(page, locator, { steps = 22, settleMs = 90 } = {}) {
  await locator.scrollIntoViewIfNeeded().catch(() => {});
  const box = await locator.boundingBox();
  if (!box) throw new Error("Cursor target has no bounding box");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps });
  if (settleMs) await page.waitForTimeout(settleMs);
  return box;
}

/** Hover + click at the element centre so the ripple lands where the eye expects. */
export async function clickHuman(page, locator, { settleMs = 120 } = {}) {
  const box = await moveTo(page, locator, { settleMs });
  await page.mouse.down();
  await page.waitForTimeout(60);
  await page.mouse.up();
  await page.waitForTimeout(settleMs);
  return box;
}
