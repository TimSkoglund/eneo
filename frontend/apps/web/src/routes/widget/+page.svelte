<script lang="ts">
  import { onMount } from "svelte";
  import ConversationView from "$lib/features/chat/components/conversation/ConversationView.svelte";

  import { initAppContext } from "$lib/core/AppContext";
  import { initIntric, getIntric } from "$lib/core/Intric";

  import { initChatService, getChatService } from "$lib/features/chat/ChatService.svelte";

  const { data } = $props<{ data: any }>();

  const widgetUi = data.widgetUi;

  // ✅ Viktigt: ConversationInput förväntar sig att chatPartner finns och har tools.
  // Om data.partner saknas (vilket den gör i /widget just nu), ger vi en säker fallback.
  const partner =
    data.partner ??
    ({
      id: "widget",
      name: widgetUi?.name ?? "Eneo Widget",
      tools: []
    } as any);

  let ready = $state(false);
  let error = $state<string | null>(null);

  const applyTheme = () => {
    if (typeof document === "undefined") return;

    const theme = widgetUi?.theme ?? "light";
    const resolved =
      theme === "auto"
        ? window.matchMedia?.("(prefers-color-scheme: dark)")?.matches
          ? "dark"
          : "light"
        : theme;

    document.documentElement.dataset.theme = resolved;
  };

  onMount(() => {
    try {
      applyTheme();

      // Intric-context (måste finnas i data från /widget/+layout.ts)
      initIntric(data);

      // AppContext med minimal “dummy user” så UI inte kraschar på roles/permissions
      initAppContext({
        ...data,
        user: data.user ?? {
          roles: [],
          hasPermission: () => false
        },
        featureFlags: data.featureFlags ?? {},
        environment: data.environment ?? {}
      });

      const intric = getIntric();
      if (!intric) {
        throw new Error("[widget] getIntric() returned undefined (check /widget/+layout.ts load)");
      }

      initChatService({
        intric,
        chatPartner: partner,
        initialConversation: Promise.resolve(null) as any,
        initialHistory: Promise.resolve({
          items: [],
          total_count: 0,
          next_cursor: null
        }) as any
      } as any);

      const chat = getChatService();
      chat.newConversation();

      ready = true;
    } catch (e: any) {
      error = e?.message ?? String(e);
      console.error("[widget] init failed", e);
    }
  });

  $effect(() => {
    applyTheme();
  });
</script>

<div
  class="flex h-dvh w-dvw flex-col overflow-hidden rounded-xl border border-default"
  style="background:{widgetUi?.bodyBg ?? '#ffffff'}; color:{widgetUi?.bodyText ?? '#111111'};"
>
  <div
    class="sticky top-0 z-10 px-4 py-3 text-sm font-semibold"
    style="background:{widgetUi?.headerBg ?? '#ffffff'}; color:{widgetUi?.headerText ?? '#111111'};"
  >
    <span class="inline-flex items-center">
      <span>{widgetUi?.name ?? "Eneo Widget"}</span>
      <span class="ml-2 text-xs font-normal opacity-70">— powered by&nbsp;</span>
      <span class="inline-flex items-center">
        <img src="/eneo_pwa_logo.png" alt="Eneo" class="ml-0.5 inline h-5" />
        <span>eneo</span>
      </span>
    </span>
  </div>

  <div class="flex-1 min-h-0">
    {#if error}
      <div class="p-4 text-sm">
        <strong>Widget error:</strong>
        <div class="mt-2">{error}</div>
      </div>
    {:else if !ready}
      <div class="p-4 text-sm opacity-70">Widgeten laddar…</div>
    {:else}
      <ConversationView />
    {/if}
  </div>
</div>
