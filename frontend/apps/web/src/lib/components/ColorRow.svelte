<script lang="ts">
  export let title: string;
  export let value: string;
  export let id: string;
  export let onPick: () => void;
  export let onHex: (v: string) => void;

  const fallback = "#FFFFFF";
</script>

<div class="space-y-2">
  <div class="text-sm font-medium">{title}</div>

  <div class="flex items-center gap-3">
    <!-- FÄRGSAMPLE: hela rutan fylls -->
    <button
      type="button"
      class="border-default hover:border-stronger ring-dimmer h-10 w-10 rounded-xl border shadow-sm transition-colors"
      style="background: {value || fallback};"
      on:click={onPick}
      aria-label={`Välj färg: ${title}`}
    ></button>

    <!-- native color picker (hidden) -->
    <input
      id={id}
      type="color"
      class="hidden"
      value={value && value.length >= 4 ? value : fallback}
      on:input={(e) => onHex((e.currentTarget as HTMLInputElement).value)}
    />

    <!-- hex-input: exakt samma “yta” som övriga formulär -->
    <input
      class="border-default bg-primary ring-dimmer focus-within:border-stronger hover:border-stronger w-36 rounded-xl border px-3 py-2 text-sm shadow-sm outline-none transition-colors"
      value={value}
      on:input={(e) => onHex((e.currentTarget as HTMLInputElement).value)}
      placeholder="#RRGGBB"
    />
  </div>
</div>
