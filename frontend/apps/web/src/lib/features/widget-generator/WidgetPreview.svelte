<script lang="ts">
  export let src: string;
</script>

<h2 class="text-sm font-semibold">Förhandsvisning</h2>

<div class="mt-4">
  <div class="mx-auto w-full max-w-[460px]">
    <div class="overflow-hidden rounded-xl">
      <div class="h-[380px] w-full">
        <iframe
          {src}
          class="h-full w-full"
          style="border:0;"
          title="Widget preview"
        ></iframe>
      </div>
    </div>

    <div class="mt-3 text-xs text-tertiary">
      Previewn visar widgeten i standard widget-format.
    </div>
  </div>
</div>
