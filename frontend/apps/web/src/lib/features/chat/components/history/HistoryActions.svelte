<script lang="ts">
  import { onMount } from "svelte";

  import { IconTrash } from "@intric/icons/trash";
  // Pencil icon export differs between versions; IconEdit is usually available.
  import { IconEdit } from "@intric/icons/edit";

  import { Button, Dialog } from "@intric/ui";
  import { getChatService } from "../../ChatService.svelte";
  import type { ConversationSparse } from "@intric/intric-js";
  import { m } from "$lib/paraglide/messages";

  export let conversation: ConversationSparse;
  export let onConversationDeleted: ((conversation: ConversationSparse) => void) | undefined =
    undefined;

  const chat = getChatService();

  let newName = "";

  // Keep input in sync when switching conversations (pre-fill with current name)
  $: newName = conversation?.name ?? "";

  const tRenameTitle = () =>
    (m as any).renameConversation?.() ??
    (m as any).rename_conversation?.() ??
    "Byt namn";

  const tRenameDesc = () =>
    (m as any).renameConversationDescription?.() ??
    (m as any).rename_conversation_description?.() ??
    "Skriv ett nytt namn för konversationen. Namnet uppdateras direkt i historiken.";

  const tSave = () => (m as any).save?.() ?? "Spara";
  const tCancel = () => (m as any).cancel?.() ?? "Avbryt";

  // Avoid HTML autofocus lint warning by focusing via JS
  let renameInput: HTMLInputElement | null = null;

  onMount(() => {
    // Note: in a dialog, this may focus on initial mount; if not, we can hook into Dialog open later.
    renameInput?.focus();
  });
</script>

<div class="flex items-center justify-end gap-2">
  <!-- Rename (pen before trash) -->
  <Dialog.Root>
    <Dialog.Trigger asFragment let:trigger>
      <Button is={trigger} label={tRenameTitle()} padding="icon">
        <IconEdit />
      </Button>
    </Dialog.Trigger>

    <Dialog.Content width="small">
      <Dialog.Title>{tRenameTitle()}</Dialog.Title>
      <Dialog.Description>{tRenameDesc()}</Dialog.Description>

      <div class="mt-4">
        <!-- Native input for compatibility with Intric UI wrappers -->
        <input
          bind:this={renameInput}
          class="w-full"
          value={newName}
          placeholder={conversation.name}
          on:input={(e) => (newName = (e.currentTarget as HTMLInputElement).value)}
        />
      </div>

      <Dialog.Controls let:close>
        <Button is={close}>{tCancel()}</Button>
        <Button
          is={close}
          on:click={async () => {
            const name = newName.trim();
            if (!name) return;

            await chat.renameConversation(conversation, name);
            newName = name;
          }}
        >
          {tSave()}
        </Button>
      </Dialog.Controls>
    </Dialog.Content>
  </Dialog.Root>

  <!-- Delete -->
  <Dialog.Root alert>
    <Dialog.Trigger asFragment let:trigger>
      <Button
        variant="destructive"
        is={trigger}
        label={m.delete_conversation?.() ?? "Ta bort"}
        padding="icon"
      >
        <IconTrash />
      </Button>
    </Dialog.Trigger>

    <Dialog.Content width="small">
      <Dialog.Title>{m.delete_conversation?.() ?? "Ta bort konversation"}</Dialog.Title>
      <Dialog.Description>
        {m.do_you_really_want_to_delete?.() ?? "Vill du verkligen ta bort"}
        <span class="italic"> {conversation.name.slice(0, 200)}</span>?
      </Dialog.Description>

      <Dialog.Controls let:close>
        <Button is={close}>{tCancel()}</Button>
        <Button
          is={close}
          variant="destructive"
          on:click={async () => {
            await chat.deleteConversation(conversation);
            onConversationDeleted?.(conversation);
          }}
        >
          {m.delete?.() ?? "Ta bort"}
        </Button>
      </Dialog.Controls>
    </Dialog.Content>
  </Dialog.Root>
</div>
