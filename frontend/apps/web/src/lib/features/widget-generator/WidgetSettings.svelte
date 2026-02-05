<script lang="ts">
  import ColorRow from "$lib/components/ColorRow.svelte";
  import { Input } from "@intric/ui";
  import type { ColorKey } from "./widgetGenerator";
  import { colorInputIds } from "./widgetGenerator";

  export let widgetName: string;
  export let eneoApi: string;

  export let isDark: boolean;
  export let onThemeChange: () => void;

  export let colors: Record<ColorKey, string>;
  export let openPicker: (key: ColorKey) => void;
  export let setColor: (key: ColorKey, value: string) => void;

  export let fieldClass: string;

  // Robust toggle – kör alltid preset-byte när isDark ändras
  let _prevIsDark = isDark;
  $: if (isDark !== _prevIsDark) {
    _prevIsDark = isDark;
    onThemeChange();
  }
</script>

<!-- Inställningar -->
<div class="space-y-4">
  <div class="pl-2.5">
    <label for="widgetName" class="text-sm font-medium  mb-2 block ">Widget namn</label>
    <input
      id="widgetName"
      class={fieldClass + " w-lg"}
      bind:value={widgetName}
    />
  </div>

  <div class="pl-2.5">
    <label for="eneoApi" class="text-sm font-medium mb-2 block">Eneo API</label>
    <input
      id="eneoApi"
      class={fieldClass + " w-lg"}
      bind:value={eneoApi}
      placeholder="https://api.dindomän.se (valfritt)"
    />
  </div>
</div>

<div class="my-4"></div>

<!-- Tema -->
 <h2 class="bg-frosted-glass-primary border-dimmer sticky top-0 z-10 col-span-2 border-b px-6 py-3 font-mono text-sm backdrop-blur-sm lg:px-2.5">Tema</h2>
<div >
  <!-- Light / Dark + switch på samma rad -->
<div class="mt-2 flex items-center gap-3 text-sm text-tertiary pl-2.5">
  <span>Light / Dark</span>
  <Input.Switch bind:value={isDark} class="*:!cursor-pointer" />
  
</div>
</div>

<!-- Färger -->
<div class="mt-4 grid gap-4 pl-2.5">
  <ColorRow
    title="Bakgrund – rubrik"
    value={colors.headerBg}
    id={colorInputIds.headerBg}
    onPick={() => openPicker("headerBg")}
    onHex={(v) => setColor("headerBg", v)}
  />

  <ColorRow
    title="Bakgrund"
    value={colors.bodyBg}
    id={colorInputIds.bodyBg}
    onPick={() => openPicker("bodyBg")}
    onHex={(v) => setColor("bodyBg", v)}
  />

  <ColorRow
    title="Rubrik – textfärg"
    value={colors.headerText}
    id={colorInputIds.headerText}
    onPick={() => openPicker("headerText")}
    onHex={(v) => setColor("headerText", v)}
  />

  <ColorRow
    title="Textfärg"
    value={colors.bodyText}
    id={colorInputIds.bodyText}
    onPick={() => openPicker("bodyText")}
    onHex={(v) => setColor("bodyText", v)}
  />
</div>
