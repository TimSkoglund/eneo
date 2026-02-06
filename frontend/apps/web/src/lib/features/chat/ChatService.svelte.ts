import { browser } from "$app/environment";
import { PAGINATION } from "$lib/core/constants";
import { createAsyncState } from "$lib/core/helpers/createAsyncState.svelte";
import { createClassContext } from "$lib/core/helpers/createClassContext";
import { waitFor } from "$lib/core/waitFor";
import {
  type ConversationSparse,
  type Assistant,
  type Conversation,
  type GroupChat,
  type Intric,
  type Paginated,
  type UploadedFile,
  type ConversationMessage,
  IntricError,
  type ConversationTools
} from "@intric/intric-js";

export type ChatPartner = GroupChat | Assistant;

// ---- Local helper types (to avoid implicit/explicit any) ----
type HasTotalHistoryTokens = { total_history_tokens?: number };

type TokenEstimateResponse = {
  breakdown?: {
    text?: number;
    files?: number;
    prompt?: number;
    // Optional detailed per-file breakdown (if backend provides it)
    file_details?: Record<string, number>;
  };
};

// ---- Infer exact callback param types from Intric SDK (prevents red squiggles) ----
type AskArgs = Parameters<Intric["conversations"]["ask"]>[0];
type AskCallbacks = NonNullable<AskArgs["callbacks"]>;

type OnFirstChunkParam = Parameters<NonNullable<AskCallbacks["onFirstChunk"]>>[0];
type OnTextParam = Parameters<NonNullable<AskCallbacks["onText"]>>[0];
type OnImageParam = Parameters<NonNullable<AskCallbacks["onImage"]>>[0];
type OnIntricEventParam = Parameters<NonNullable<AskCallbacks["onIntricEvent"]>>[0];

// Minimal "shapes" we need inside callbacks
type HasSessionId = { session_id?: string };
type TextChunkShape = {
  session_id?: string;
  answer?: string;
  references?: ConversationMessage["references"];
};
type IntricEventShape = {
  session_id?: string;
  intric_event_type?: string;
  usage?: { turn_tokens?: number };
};

export class ChatService {
  #chatPartner = $state<ChatPartner>() as ChatPartner; // Needs typecast to get rid of undefined
  partner = $derived(this.#chatPartner);
  hasCompletionModel = $derived(
    this.#chatPartner &&
      "completion_model" in this.#chatPartner &&
      this.#chatPartner.completion_model !== null &&
      this.#chatPartner.completion_model !== undefined
  );
  #intric: Intric;
  currentConversation = $state<Conversation>(emptyConversation());
  totalConversations = $state<number>(0);
  loadedConversations = $state<ConversationSparse[]>([]);
  hasMoreConversations = $derived(this.loadedConversations.length < this.totalConversations);
  #nextCursor = $state<string | null>(null);

  // Track total tokens used in the current conversation
  historyTokens = $state<number>(0);

  // Track assistant prompt tokens separately so we only count them once
  promptTokens = $state<number>(0);

  // Track tokens for the message being composed
  newPromptTokens = $state<number>(0);

  // Separate tracking for text and file tokens to prevent race conditions
  #textTokensApprox = $state<number>(0);
  #fileTokensCache = $state<number>(0);
  #lastCalculatedAttachmentIds = new Set<string>();

  // Track current state to avoid closure issues
  #currentText = "";
  #currentAttachmentIdString = "";

  // Learn token density from API responses for better approximations
  #learnedCharsPerToken = 4.0; // Default approximation, will be refined by API responses

  // Cache token counts per file ID to avoid resets when adding/removing files
  #fileTokenMap = new Map<string, number>();

  // Debounce timer for token calculations
  #tokenCalculationTimer: ReturnType<typeof setTimeout> | null = null;

  // Debounce timer for new prompt token calculations
  #newPromptTokenTimer: ReturnType<typeof setTimeout> | null = null;

  // Streaming buffer for smoother text rendering (rAF-based for frame alignment)
  #streamBuffer = "";
  #streamAnimationFrame: number | null = null;
  #lastFlushTime = 0;
  #streamRef: ConversationMessage | null = null;
  #streamFlushInterval = 33; // ~30fps target, imperceptible delay but smoother rendering
  #streamGen = 0;
  #producerFlushThreshold = 2048; // Safety flush for background tabs or fast streams

  constructor(data: Parameters<typeof this.init>[0]) {
    this.#intric = data.intric;
    this.init(data);

    // Automatically calculate history tokens when conversation changes
    $effect(() => {
      if (this.currentConversation?.messages?.length > 0) {
        this.calculateHistoryTokens();
      }
    });
  }

  init(data: {
    intric: Intric;
    chatPartner: ChatPartner;
    initialConversation?: Promise<Conversation | null> | Conversation | null;
    initialHistory?: Promise<Paginated<ConversationSparse>> | Paginated<ConversationSparse>;
  }) {
    this.#chatPartner = data.chatPartner;

    waitFor(data.initialHistory, {
      onLoaded: (initialHistory) => {
        this.loadedConversations = initialHistory.items;
        this.totalConversations = initialHistory.total_count;
        this.#nextCursor = initialHistory.next_cursor ?? null;
      }
    });

    waitFor(data.initialConversation, {
      onLoaded: (initialConversation) => {
        if (!initialConversation) {
          this.currentConversation = emptyConversation();
          this.historyTokens = 0;
          return;
        }

        this.currentConversation = initialConversation;

        const t = (initialConversation as HasTotalHistoryTokens).total_history_tokens;
        if (typeof t === "number") {
          this.historyTokens = t;
        } else {
          this.calculateHistoryTokens();
        }
      },
      onNull: () => {
        this.currentConversation = emptyConversation();
        this.historyTokens = 0;
      }
    });
  }

  newConversation() {
    this.currentConversation = emptyConversation();
    this.historyTokens = 0;
    this.newPromptTokens = 0;
    this.promptTokens = 0;
  }

  // RAF-based flush loop for smooth frame-aligned rendering
  #flushLoop = (timestamp: number) => {
    if (!this.#streamRef) return;

    const elapsed = timestamp - this.#lastFlushTime;

    if (elapsed >= this.#streamFlushInterval && this.#streamBuffer) {
      this.#streamRef.answer += this.#streamBuffer;
      this.#streamBuffer = "";
      this.#lastFlushTime = timestamp;
    }

    if (this.#streamRef) {
      this.#streamAnimationFrame = requestAnimationFrame(this.#flushLoop);
    }
  };

  #startStreamBuffering(ref: ConversationMessage) {
    if (this.#streamRef === ref) return;

    this.#streamRef = ref;
    this.#lastFlushTime = performance.now();

    if (this.#streamAnimationFrame) {
      cancelAnimationFrame(this.#streamAnimationFrame);
    }

    this.#streamAnimationFrame = requestAnimationFrame(this.#flushLoop);
  }

  #finalizeStream() {
    if (this.#streamAnimationFrame) {
      cancelAnimationFrame(this.#streamAnimationFrame);
      this.#streamAnimationFrame = null;
    }

    if (this.#streamBuffer && this.#streamRef) {
      this.#streamRef.answer += this.#streamBuffer;
      this.#streamBuffer = "";
    }

    this.#streamRef = null;
  }

  async loadConversations(args?: { limit?: number; reset?: boolean }) {
    try {
      if (args?.reset) {
        this.#nextCursor = null;
      }
      const response = await this.#intric.conversations.list({
        chatPartner: this.#chatPartner,
        pagination: {
          limit: args?.limit ?? PAGINATION.PAGE_SIZE,
          cursor: this.#nextCursor ?? undefined
        }
      });

      if (args?.reset) {
        this.loadedConversations = response.items;
      } else {
        this.loadedConversations.push(...response.items);
      }

      this.#nextCursor = response.next_cursor ?? null;
      this.totalConversations = response.total_count;
      return response;
    } catch (error) {
      console.error("Error loading pagination", error);
    }
  }

  async loadMoreConversations(args?: { limit?: number }) {
    return this.loadConversations(args);
  }

  async reloadHistory() {
    return this.loadConversations({ reset: true });
  }

  async deleteConversation(conversation: { id: string }) {
    try {
      await this.#intric.conversations.delete(conversation);
      this.loadedConversations = this.loadedConversations.filter(({ id }) => id !== conversation.id);
      if (this.currentConversation?.id === conversation.id) {
        this.newConversation();
      }
    } catch (e) {
      if (browser) alert(`Error while deleting conversation with id ${conversation.id}`);
      console.error(e);
    }
  }

  async renameConversation(conversation: { id: string }, name: string) {
    try {
      const trimmed = name.trim();
      if (!trimmed) return;

      await this.#intric.conversations.rename(conversation, { name: trimmed });

      this.loadedConversations = this.loadedConversations.map((c) =>
        c.id === conversation.id ? { ...c, name: trimmed } : c
      );

      if (this.currentConversation?.id === conversation.id) {
        this.currentConversation = { ...this.currentConversation, name: trimmed };
      }
    } catch (e) {
      if (browser) alert(`Error while renaming conversation with id ${conversation.id}`);
      console.error(e);
    }
  }

  async loadConversation(conversation: { id: string }) {
    try {
      const loaded = await this.#intric.conversations.get(conversation);
      this.currentConversation = loaded;

      const t = (loaded as unknown as HasTotalHistoryTokens).total_history_tokens;
      if (typeof t === "number") {
        this.historyTokens = t;
      } else {
        this.calculateHistoryTokens();
      }

      return loaded;
    } catch (e) {
      if (browser) alert(`Error while loading conversation with id ${conversation.id}`);
      console.error(e);
    }
  }

  changeChatPartner(newPartner: ChatPartner) {
    const oldPartner = this.#chatPartner;
    this.#chatPartner = newPartner;

    if (oldPartner !== newPartner) {
      this.newConversation();
      this.reloadHistory();
      this.newPromptTokens = 0;
      this.promptTokens = 0;
    }
  }

  askQuestion = createAsyncState(
    async (
      question: string,
      attachments?: UploadedFile[],
      tools?: ConversationTools,
      useWebSearch?: boolean,
      abortController?: AbortController
    ) => {
      this.currentConversation.messages?.push(emptyMessage({ question }));

      this.#finalizeStream();
      const streamGen = ++this.#streamGen;
      let inrefBuffer = "";
      const ref = this.currentConversation.messages[this.currentConversation.messages?.length - 1];
      const isStale = () => this.#streamGen !== streamGen;

      const ensureCurrentSession = (event: unknown) => {
        const sessionId = (event as HasSessionId | null)?.session_id;
        // If the SDK ever emits events without session_id, don't block streaming
        if (!sessionId) return true;

        if (sessionId !== this.currentConversation.id) {
          abortController?.abort();
          console.error(`cancelled streaming answer as session ${sessionId} was changed.`);
          return false;
        }
        return true;
      };

      try {
        await this.#intric.conversations.ask({
          question,
          chatPartner: this.#chatPartner,
          conversation: { id: this.currentConversation.id },
          files: (attachments ?? []).map((fileRef) => ({ id: fileRef.id })),
          tools,
          abortController,
          useWebSearch,
          callbacks: {
            onFirstChunk: (chunk: OnFirstChunkParam) => {
              if (isStale()) return;
              Object.assign(ref, chunk as Partial<ConversationMessage>);

              const sid = (chunk as HasSessionId).session_id;
              if (sid) this.currentConversation.id = sid;

              this.currentConversation.name = question;
            },
            onText: (text: OnTextParam) => {
              if (isStale()) {
                abortController?.abort();
                return;
              }

              const t = text as unknown as TextChunkShape;
              if (!ensureCurrentSession(t)) return;

              const answer = t.answer ?? "";
              const references = t.references ?? [];

              // Handle inref buffering (existing logic)
              let textToAdd = answer;
              if (answer.includes("<") || inrefBuffer) {
                inrefBuffer += answer;
                if (isNotInref(inrefBuffer) || isCompleteInref(inrefBuffer)) {
                  textToAdd = inrefBuffer;
                  inrefBuffer = "";
                } else {
                  textToAdd = ""; // Wait for complete inref
                }
              }

              if (textToAdd) {
                if (!browser || typeof requestAnimationFrame !== "function") {
                  ref.answer += textToAdd;
                } else {
                  this.#streamBuffer += textToAdd;

                  if (this.#streamBuffer.length >= this.#producerFlushThreshold) {
                    ref.answer += this.#streamBuffer;
                    this.#streamBuffer = "";
                    this.#lastFlushTime = performance.now();
                  }

                  this.#startStreamBuffering(ref);
                }
              }

              ref.references = references;
            },
            onImage: (image: OnImageParam) => {
              if (isStale()) return;
              if (!ensureCurrentSession(image)) return;
              Object.assign(ref, image as Partial<ConversationMessage>);
            },
            onIntricEvent: (event: OnIntricEventParam) => {
              if (isStale()) return;

              const ev = event as unknown as IntricEventShape;
              if (!ensureCurrentSession(ev)) return;

              const eventType = ev.intric_event_type;

              // Debug logging for token-related events only
              if (ev.usage || eventType === "token_usage") {
                console.log("[ChatService] Received potential token event:", {
                  eventType,
                  hasUsage: !!ev.usage,
                  turnTokens: ev.usage?.turn_tokens,
                  fullEvent: event
                });
              }

              if (eventType === "generating_image") {
                ref.generated_files.push({ id: "", name: "", mimetype: "", size: 0 });
              }

              if (ev.usage?.turn_tokens) {
                const turnTokens = ev.usage.turn_tokens;
                const oldTokens = this.historyTokens;
                this.historyTokens += turnTokens;
                console.log("[ChatService] ✅ TOKEN UPDATE RECEIVED:", {
                  turnTokens,
                  oldTotal: oldTokens,
                  newTotal: this.historyTokens
                });
              } else if (eventType === "token_usage") {
                console.log(
                  "[ChatService] Received token_usage event but no turn_tokens found:",
                  event
                );
              }
            }
          }
        });
      } catch (error) {
        if (isStale()) return;

        const streamAborted = error instanceof Error && error.message.includes("aborted");
        if (streamAborted) {
          return;
        }

        let message = "We encountered an error processing your request.";
        if (error instanceof IntricError) {
          message += `\n\`\`\`\n${error.code}: "${error.getReadableMessage()}"\n\`\`\``;
        } else if (error instanceof Object && "message" in error && "name" in error) {
          message += `\n\`\`\`\n${String(error.name)}: ${String(
            (error as { message?: unknown }).message
          )}\n\`\`\``;
        }

        this.currentConversation.messages[this.currentConversation.messages?.length - 1].answer =
          message;
        console.error(error);
      } finally {
        if (this.#streamGen === streamGen) {
          if (inrefBuffer) {
            ref.answer += inrefBuffer;
            inrefBuffer = "";
          }

          this.#finalizeStream();
        }
      }

      if (this.#streamGen === streamGen) {
        this.reloadHistory();
      }
    }
  );

  async calculateHistoryTokens() {
    if (!this.#chatPartner?.id || !this.currentConversation?.messages?.length) {
      return;
    }

    if (this.#tokenCalculationTimer) {
      clearTimeout(this.#tokenCalculationTimer);
    }

    this.#tokenCalculationTimer = setTimeout(async () => {
      try {
        const fullText = this.currentConversation.messages
          .map((msg) => {
            let text = "";
            if (msg.question) text += msg.question + "\n";
            if (msg.answer) text += msg.answer + "\n";
            return text;
          })
          .join("\n");

        const fileIds = this.currentConversation.messages
          .flatMap((msg) => msg.files || [])
          .filter((file) => file.id)
          .map((file) => file.id);

        const response = (await this.#intric.client.fetch(
          "/api/v1/assistants/{id}/token-estimate",
          {
            method: "post",
            params: {
              path: { id: this.#chatPartner.id }
            },
            requestBody: {
              "application/json": {
                text: fullText,
                file_ids: fileIds
              }
            }
          }
        )) as unknown as TokenEstimateResponse;

        if (response) {
          const breakdown = response.breakdown || {};
          const promptTokens = breakdown.prompt ?? this.promptTokens;
          const historyTokens = (breakdown.text || 0) + (breakdown.files || 0);

          this.promptTokens = promptTokens;
          this.historyTokens = historyTokens;

          console.log(
            `[ChatService] Token usage: ${(promptTokens + historyTokens).toLocaleString()} tokens ` +
              `(text: ${breakdown.text || 0}, files: ${breakdown.files || 0}, prompt: ${promptTokens})`
          );
        }
      } catch {
        console.error("[ChatService] Token calculation failed, using fallback");
        const fallbackTokens = Math.ceil(
          this.currentConversation.messages
            .map((msg) => (msg.question || "").length + (msg.answer || "").length)
            .reduce((a, b) => a + b, 0) / 4
        );
        this.historyTokens = fallbackTokens;
      }
    }, 500);
  }

  async calculateNewPromptTokens(text: string, attachments: { id: string; size?: number }[]) {
    if (!this.#chatPartner?.id) {
      this.newPromptTokens = 0;
      this.#textTokensApprox = 0;
      this.#fileTokensCache = 0;
      return;
    }

    this.#currentText = text;

    this.#textTokensApprox = Math.ceil(text.length / this.#learnedCharsPerToken);

    const attachmentIds = attachments.map((a) => a.id).filter(Boolean);
    const attachmentIdString = attachmentIds.sort().join(",");

    const attachmentsChanged = attachmentIdString !== this.#currentAttachmentIdString;

    if (attachmentsChanged) {
      const estimateTokensFromSize = (fileSize?: number | null) => {
        const fallbackSize = 100_000; // ~250 tokens fallback when size is unknown
        const size = fileSize && fileSize > 0 ? fileSize : fallbackSize;
        const bytesPerToken = 400; // generous average across supported formats
        return Math.ceil(size / bytesPerToken);
      };

      let totalFileTokens = 0;
      for (const fileId of attachmentIds) {
        if (this.#fileTokenMap.has(fileId)) {
          totalFileTokens += this.#fileTokenMap.get(fileId)!;
        } else {
          const attachment = attachments.find((file) => file.id === fileId);
          const roughEstimate = estimateTokensFromSize(attachment?.size);
          this.#fileTokenMap.set(fileId, roughEstimate);
          totalFileTokens += roughEstimate;
        }
      }

      const currentFileIdSet = new Set(attachmentIds);
      for (const cachedFileId of this.#fileTokenMap.keys()) {
        if (!currentFileIdSet.has(cachedFileId)) {
          this.#fileTokenMap.delete(cachedFileId);
        }
      }

      this.#fileTokensCache = totalFileTokens;
      this.#currentAttachmentIdString = attachmentIdString;
      this.#lastCalculatedAttachmentIds = new Set(attachmentIds);
    }

    this.newPromptTokens = this.#textTokensApprox + this.#fileTokensCache;

    if (text.trim().length === 0 && attachments.length === 0) {
      this.newPromptTokens = 0;
      this.#textTokensApprox = 0;
      this.#fileTokensCache = 0;
      this.#fileTokenMap.clear();
      this.#lastCalculatedAttachmentIds.clear();
      return;
    }

    if (this.#newPromptTokenTimer) {
      clearTimeout(this.#newPromptTokenTimer);
    }

    const requestText = text;
    const requestAttachmentIdString = attachmentIdString;

    this.#newPromptTokenTimer = setTimeout(async () => {
      try {
        if (
          this.#currentText !== requestText ||
          this.#currentAttachmentIdString !== requestAttachmentIdString
        ) {
          return;
        }

        const fileIds = requestAttachmentIdString.split(",").filter(Boolean);

        const response = (await this.#intric.client.fetch(
          "/api/v1/assistants/{id}/token-estimate",
          {
            method: "post",
            params: {
              path: { id: this.#chatPartner.id }
            },
            requestBody: {
              "application/json": {
                text,
                file_ids: fileIds
              }
            }
          }
        )) as unknown as TokenEstimateResponse;

        if (response?.breakdown) {
          const apiTextTokens = response.breakdown.text || 0;
          const apiTextLength = text.length;

          if (apiTextTokens > 0 && apiTextLength > 0) {
            const newCharsPerToken = apiTextLength / apiTextTokens;
            this.#learnedCharsPerToken = this.#learnedCharsPerToken * 0.8 + newCharsPerToken * 0.2;
          }
        }

        if (
          this.#currentText !== requestText ||
          this.#currentAttachmentIdString !== requestAttachmentIdString
        ) {
          return;
        }

        const breakdown = response?.breakdown;
        if (breakdown) {
          if (breakdown.file_details) {
            for (const [fileId, tokenCount] of Object.entries(breakdown.file_details)) {
              this.#fileTokenMap.set(fileId, tokenCount);
            }
          }

          this.#fileTokensCache = breakdown.files || 0;

          const promptTokens = breakdown.prompt ?? this.promptTokens;
          this.promptTokens = promptTokens;

          const totalNewTokens = (breakdown.text || 0) + (breakdown.files || 0);
          this.newPromptTokens = totalNewTokens;
        }
      } catch (error) {
        console.error("[ChatService] Token calculation failed, keeping approximation:", error);
      }
    }, 300);
  }

  resetNewPromptTokens() {
    this.newPromptTokens = 0;
    this.#textTokensApprox = 0;
    this.#fileTokensCache = 0;
    this.#fileTokenMap.clear();
    this.#lastCalculatedAttachmentIds.clear();
    this.#currentText = "";
    this.#currentAttachmentIdString = "";

    if (this.#newPromptTokenTimer) {
      clearTimeout(this.#newPromptTokenTimer);
      this.#newPromptTokenTimer = null;
    }
  }
}

export const [getChatService, initChatService] = createClassContext("Chat service", ChatService);

function emptyMessage(partial?: Partial<ConversationMessage>): ConversationMessage {
  return {
    generated_files: [],
    question: "",
    answer: "",
    references: [],
    files: [],
    web_search_references: [],
    tools: {
      assistants: []
    },
    ...partial
  };
}

function emptyConversation(): Conversation {
  return {
    id: "",
    name: "New conversation",
    messages: []
  };
}

const couldBeInref = (buffer: string): boolean => {
  const start = buffer.indexOf("<");
  if (start === -1) return false;

  const tag = "<inref";
  const max = Math.min(tag.length, buffer.length - start);
  return buffer.slice(start, start + max) === tag.slice(0, max);
};
const isNotInref = (buffer: string): boolean => !couldBeInref(buffer);
const isCompleteInref = (buffer: string): boolean => {
  if (!couldBeInref(buffer)) return false;
  const start = buffer.indexOf("<");
  return buffer.indexOf(">", start) !== -1;
};
