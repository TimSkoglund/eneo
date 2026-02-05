<script lang="ts">
  import { Button, Tooltip } from "@intric/ui";
  import { IconCopy } from "@intric/icons/copy";
  import { IconEdit } from "@intric/icons/edit";
  import { getMessageContext } from "../../MessageContext.svelte";
  import { createEventDispatcher } from "svelte";
  import { m } from "$lib/paraglide/messages";

  const { current } = getMessageContext();
  const message = $derived(current());

  // Event för att tala om för Message.svelte att användaren vill redigera frågan
  const dispatch = createEventDispatcher<{ edit: void }>();

  let showCopiedMessage = $state(false);
</script>

<div
  class="mt-1 mb-4 flex justify-end md:opacity-0 group-hover/message:opacity-100 transition-opacity"
>
  <div class="flex gap-2 -mr-0">
    <!-- Kopiera fråga -->
    <Tooltip text="Kopiera fråga">
      <Button
        type="button"
        unstyled
        padding="icon"
        class="border-default hover:bg-hover-stronger flex gap-2 rounded-lg border p-1.5 shadow-sm"
        on:click={() => {
          navigator.clipboard.writeText(message.question);
          showCopiedMessage = true;
          setTimeout(() => {
            showCopiedMessage = false;
          }, 2000);
        }}
      >
        <IconCopy />
        {#if showCopiedMessage}
          <span class="pr-2">{m.copied()}</span>
        {/if}
      </Button>
    </Tooltip>

    <!-- Redigera fråga – triggar edit-event -->
    <Tooltip text="Redigera fråga">
      <Button
        type="button"
        unstyled
        padding="icon"
        class="border-default hover:bg-hover-stronger flex gap-2 rounded-lg border p-1.5 shadow-sm"
        on:click={() => {
          dispatch("edit");
        }}
      >
        <IconEdit />
      </Button>
    </Tooltip>
  </div>
</div>
