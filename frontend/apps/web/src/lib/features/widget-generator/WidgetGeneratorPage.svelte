<script lang="ts">
  import { Page, Settings } from "$lib/components/layout";

  import WidgetSettings from "./WidgetSettings.svelte";
  import WidgetPreview from "./WidgetPreview.svelte";
  import WidgetEmbedCode from "./WidgetEmbedCode.svelte";

  import type { ColorKey, Theme } from "./widgetGenerator";
  import { DARK_PRESET, LIGHT_PRESET, colorInputIds, normalizeHex } from "./widgetGenerator";

  let widgetName = "Eneo Widget";
  let eneoApi = "";

  let theme: Theme = "light";
  let isDark = false;

  let colors: Record<ColorKey, string> = { ...LIGHT_PRESET };

  function applyPreset(next: Theme) {
    theme = next;
    isDark = next === "dark";
    colors = next === "light" ? { ...LIGHT_PRESET } : { ...DARK_PRESET };
  }

  function onThemeChange() {
    applyPreset(isDark ? "dark" : "light");
  }

  const setColor = (key: ColorKey, value: string) => {
    colors = { ...colors, [key]: normalizeHex(value) };
  };

  function openPicker(key: ColorKey) {
    const el = document.getElementById(colorInputIds[key]) as HTMLInputElement | null;
    el?.click();
  }

  const widgetSrc = () => {
    const u = new URL(
      "/widget",
      typeof window !== "undefined" ? window.location.origin : "http://localhost"
    );

    u.searchParams.set("name", widgetName);
    u.searchParams.set("theme", theme);
    u.searchParams.set("headerBg", colors.headerBg || "");
    u.searchParams.set("headerText", colors.headerText || "");
    u.searchParams.set("bodyBg", colors.bodyBg || "");
    u.searchParams.set("bodyText", colors.bodyText || "");

    if (eneoApi.trim()) u.searchParams.set("api", eneoApi.trim());

    return u.pathname + u.search;
  };

  const embedCode = () => {
    const absolute =
      typeof window !== "undefined" ? `${window.location.origin}${widgetSrc()}` : widgetSrc();

    return `<iframe
  src="${absolute}"
  style="width:100%;height:640px;border:0;border-radius:16px;overflow:hidden"
  allow="clipboard-write; microphone"
  loading="lazy"
></iframe>`;
  };

  async function copyCode() {
    await navigator.clipboard.writeText(embedCode());
  }

  const fieldClass =
    "border-default bg-primary ring-dimmer focus-within:border-stronger hover:border-stronger rounded-xl border px-3 py-2 text-sm shadow-sm outline-none transition-colors";
</script>

<Page.Root>
  <Page.Header>
    <Page.Title title="Widget generator" />
  </Page.Header>

  <Page.Main>
    <Settings.Page>
      <Settings.Group title="Widgetinställningar">
        <div class="grid items-start gap-10 lg:grid-cols-[2fr_1fr]">
          <div class="min-w-0">
            <WidgetSettings
              bind:widgetName
              bind:eneoApi
              bind:isDark
              {onThemeChange}
              {colors}
              {openPicker}
              {setColor}
              {fieldClass}
            />
          </div>

          <aside class="min-w-0 lg:sticky lg:top-6">
            <WidgetPreview src={widgetSrc()} />
          </aside>
        </div>
      </Settings.Group>

      <!-- Behåll rubrik + full bredd, men dra upp gruppen lite -->
      <div class="-mt-14">
        <Settings.Group title="Embed-kod">
          <WidgetEmbedCode code={embedCode()} {copyCode} />
        </Settings.Group>
      </div>
    </Settings.Page>
  </Page.Main>
</Page.Root>
