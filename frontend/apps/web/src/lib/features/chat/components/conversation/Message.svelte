<script lang="ts">
  import type { ConversationMessage } from "@intric/intric-js";
  import { IconLoadingSpinner } from "@intric/icons/loading-spinner";
  import MessageQuestion from "./MessageQuestion.svelte";
  import MessageAnswer from "./MessageAnswer.svelte";
  import MessageFiles from "./MessageFiles.svelte";
  import MessageTools from "./MessageTools.svelte";
  import MessageQuestionTools from "./MessageQuestionTools.svelte";
  import { browser } from "$app/environment";
  import { getChatService } from "../../ChatService.svelte";
  import { setMessageContext } from "../../MessageContext.svelte";
  import { m } from "$lib/paraglide/messages";
  import { Button } from "@intric/ui";
  import { createEventDispatcher, tick } from "svelte";

  interface Props {
    message: ConversationMessage;
    isLast: boolean;
    isLoading: boolean;
  }

  let { message, isLast, isLoading }: Props = $props();

  // Redigeringsläge för assistentens svar
  let isEditing: boolean = $state(false);
  let editedAnswer: string = $state(message.answer);

  // Redigeringsläge för användarens fråga
  let isEditingQuestion: boolean = $state(false);
  let editedQuestion: string = $state(message.question);

  // ✅ ÄNDRING: lägg till event för att parent ska kunna PATCH:a edited_answer med session_id
  const dispatch = createEventDispatcher<{
    reask: { question: string };
    saveEditedAnswer: { questionId: string; editedAnswer: string | null }; // ✅ NYTT
  }>();

  setMessageContext({
    current: () => message,
    isLast: () => isLast,
    isLoading: () => isLoading
  });

  const chat = getChatService();

  let messageHeight: number = $state(0);

  // Minsta bredd på edit-fältet för fråga (px)
  const MIN_QUESTION_EDIT_WIDTH = 260;

  // Referens till den här message-containern + sparad textbredd för frågan
  let messageContainer = $state() as HTMLDivElement;
  let questionTextWidth = $state<number | null>(null);

  // ref till textareorna för auto-höjd
  let editQuestionTextarea = $state() as HTMLTextAreaElement | null;
  let editAnswerTextarea = $state() as HTMLTextAreaElement | null;

  function autosizeQuestion() {
    if (!editQuestionTextarea) return;
    const extra = 12;
    editQuestionTextarea.style.height = "auto";
    editQuestionTextarea.style.height = `${editQuestionTextarea.scrollHeight + extra}px`;
  }

  function autosizeAnswer() {
    if (!editAnswerTextarea) return;
    const extra = 12;
    editAnswerTextarea.style.height = "auto";
    editAnswerTextarea.style.height = `${editAnswerTextarea.scrollHeight + extra}px`;
  }

  const updateHeight = (isLast: boolean) => {
    if (!isLast || !browser) {
      messageHeight = 0;
      return;
    }

    setTimeout(() => {
      const viewContainer = document.getElementById("session-view-container");
      const inputContainer = document.getElementById("session-input-container");
      const messageContainer = document.getElementById("session-message-container");
      const question = [...document.querySelectorAll(".question")].pop();

      if (viewContainer && inputContainer && messageContainer && question) {
        const containerHeight = viewContainer.clientHeight;
        const inputFieldHeight = inputContainer.clientHeight;
        const parentPadding = parseInt(getComputedStyle(messageContainer).paddingBottom);
        // If the question is longer than 0.5 of the screen, we jump directly to the answer
        const extraSpace =
          question.clientHeight > containerHeight * 0.5 ? question.clientHeight + parentPadding : 0;

        messageHeight = containerHeight - inputFieldHeight - 2 * parentPadding + extraSpace;
      }
    }, 1);
  };

  $effect(() => {
    updateHeight(isLast);
  });

  const showSpinner = $derived.by(() => {
    const isGeneratingImage = message.generated_files.length > 0;
    return isLast && isLoading && !isGeneratingImage;
  });

  const isReasoning = $derived.by(() => {
    const modelCanReason =
      "completion_model" in chat.partner && chat.partner.completion_model?.reasoning;
    const noAnswerReceived = message.answer.trim() === "";
    return modelCanReason && noAnswerReceived;
  });
</script>

<svelte:window onresize={() => updateHeight(isLast)} />

<!-- Yttersta containern för ett message -->
<div
  class="group/message mx-auto flex w-full max-w-[71ch] flex-col gap-4"
  data-is-last-message={isLast}
  style="min-height: {messageHeight}px"
  bind:this={messageContainer}
>
  <MessageFiles />

  {#if isEditingQuestion}
    <!-- Frågan i redigeringsläge -->
    <div
      class="question prose max-w-full self-end rounded-3xl rounded-br-none px-8 py-4 break-words md:max-w-[85%] bg-accent-dimmer"
    >
      <span class="sr-only">{m.question()}</span>

      <!-- Bredden här matchar frågebubblans textbredd, men aldrig mindre än MIN_QUESTION_EDIT_WIDTH -->
      <div
        style={questionTextWidth
          ? `width: ${Math.max(questionTextWidth, MIN_QUESTION_EDIT_WIDTH)}px`
          : `width: ${MIN_QUESTION_EDIT_WIDTH}px`}
      >
        <textarea
          id={"edit-question-" + message.id}
          bind:this={editQuestionTextarea}
          bind:value={editedQuestion}
          class="border-default bg-surface-default focus:border-accent-default focus:outline-none focus:ring-2 focus:ring-accent-dimmer min-h-[3rem] w-full rounded-md border px-3 py-2 text-base resize-none"
          on:input={autosizeQuestion}
        ></textarea>
      </div>

      <div class="mt-2 flex justify-end gap-2">
        <Button
          type="button"
          variant="primary"
          on:click={() => {
            // Låt gamla frågan i historiken vara kvar, men be om nytt svar på den redigerade texten
            isEditingQuestion = false;
            dispatch("reask", { question: editedQuestion });
          }}
        >
          Spara
        </Button>

        <Button
          type="button"
          variant="outlined"
          on:click={() => {
            editedQuestion = message.question;
            isEditingQuestion = false;
          }}
        >
          Avbryt
        </Button>
      </div>
    </div>
  {:else}
    <!-- Normalt läge: original-frågebubblan -->
    <MessageQuestion />
  {/if}

  <!-- Verktyg under frågan, visas bara när vi inte redigerar frågan -->
  {#if !isEditingQuestion}
    <MessageQuestionTools
      on:edit={async () => {
        // När man klickar "redigera", mät nuvarande frågebubblas textbredd
        if (browser && messageContainer) {
          const questionEl = messageContainer.querySelector(".question") as HTMLElement | null;
          const p = questionEl?.querySelector("p") as HTMLElement | null;

          if (p) {
            questionTextWidth = p.offsetWidth;
          } else {
            questionTextWidth = null;
          }
        }

        editedQuestion = message.question;
        isEditingQuestion = true;

        // Vänta tills DOM uppdaterats och auto-justera höjd
        await tick();
        autosizeQuestion();
      }}
    />
  {/if}

  <!-- SVAR + svarets verktyg -->
  <div
    class="group/answer w-full transition-colors"
    class:border-accent-default={isEditing}
    class:bg-accent-dimmer={isEditing}
    class:rounded-xl={isEditing}
    class:p-3={isEditing}
  >
    {#if isEditing}
      <!-- Redigeringsläge för svaret -->
      <div class="flex flex-col gap-2">
        <label class="sr-only" for={"edit-answer-" + message.id}>
          {m.answer()}
        </label>
        <textarea
          id={"edit-answer-" + message.id}
          bind:this={editAnswerTextarea}
          bind:value={editedAnswer}
          class="border-default bg-surface-default focus:border-accent-default focus:outline-none focus:ring-2 focus:ring-accent-dimmer min-h-[6rem] w-full rounded-md border px-3 py-2 text-base resize-none"
          on:input={autosizeAnswer}
        ></textarea>

        <div class="mt-2 flex gap-2">
          <Button
            type="button"
            variant="primary"
            on:click={() => {
              // ✅ ÄNDRING: optimistisk UI-uppdatering + dispatch till parent för att PATCH:a edited_answer
              message.answer = editedAnswer;
              isEditing = false;

              dispatch("saveEditedAnswer", {
                questionId: String(message.id),
                editedAnswer: editedAnswer ?? null
              });
            }}
          >
            Spara
          </Button>

          <Button
            type="button"
            variant="outlined"
            on:click={() => {
              editedAnswer = message.answer;
              isEditing = false;
            }}
          >
            Avbryt
          </Button>
        </div>
      </div>
    {:else}
      <!-- Normalt läge: visa svaret -->
      <MessageAnswer />
    {/if}

    {#if showSpinner}
      <div class="flex items-center gap-2">
        <IconLoadingSpinner class="animate-spin" />
        {#if isReasoning}
          <span
            class="bg-accent-dimmer text-accent-stronger w-fit animate-pulse rounded-full px-4 py-2"
            >{m.thinking()}</span
          >
        {/if}
      </div>
    {:else}
      <!-- Verktyg under svaret, visas bara när vi inte redigerar svaret -->
      {#if !isEditing}
        <div class="mt-4">
          <MessageTools
            on:edit={async () => {
              editedAnswer = message.answer;
              isEditing = true;

              // Vänta tills textarea finns i DOM, sedan auto-justera höjd efter befintlig text
              await tick();
              autosizeAnswer();
            }}
          />
        </div>
      {/if}
    {/if}
  </div>
</div>
