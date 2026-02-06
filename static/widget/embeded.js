(function () {
  // Find the script tag that loaded this file
  const script = document.currentScript;
  if (!script) return;

  // Read attributes from <script ...>
  const widgetUrl = script.getAttribute("data-eneo-url") || "/widget";
  const mountSelector = script.getAttribute("data-eneo-mount") || null;

  // Collect config from data-attributes (keep this minimal & explicit)
  const config = {
    name: script.getAttribute("data-eneo-name") || "Eneo",
    theme: script.getAttribute("data-eneo-theme") || "auto", // "light" | "dark" | "auto"
    accent: script.getAttribute("data-eneo-accent") || null,
  };

  // Encode config into the iframe url
  const encoded = encodeURIComponent(btoa(unescape(encodeURIComponent(JSON.stringify(config)))));
  const src = widgetUrl.includes("?")
    ? `${widgetUrl}&config=${encoded}`
    : `${widgetUrl}?config=${encoded}`;

  // Determine mount point
  let mountEl = null;
  if (mountSelector) mountEl = document.querySelector(mountSelector);

  // Create iframe
  const iframe = document.createElement("iframe");
  iframe.src = src;
  iframe.title = "Eneo Widget";
  iframe.setAttribute("loading", "lazy");
  iframe.style.border = "0";
  iframe.style.width = "380px";
  iframe.style.height = "560px";
  iframe.style.borderRadius = "16px";
  iframe.style.boxShadow = "0 12px 40px rgba(0,0,0,0.25)";
  iframe.style.background = "transparent";

  // Default: floating bottom-right if no mount selector is provided / found
  if (!mountEl) {
    const wrapper = document.createElement("div");
    wrapper.style.position = "fixed";
    wrapper.style.right = "16px";
    wrapper.style.bottom = "16px";
    wrapper.style.zIndex = "2147483647";
    wrapper.style.width = iframe.style.width;
    wrapper.style.height = iframe.style.height;

    wrapper.appendChild(iframe);
    document.body.appendChild(wrapper);
  } else {
    mountEl.appendChild(iframe);
  }
})();
