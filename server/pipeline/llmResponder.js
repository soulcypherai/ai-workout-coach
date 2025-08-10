import dotenv from "dotenv";
import OpenAI from "openai";

import pool from "../db/index.js";
import { systemAlerts } from "../lib/alerting.js";
import { logger } from "../lib/cloudwatch-logger.js";
import { getAvatarPersona } from "../personas/config.js";
import {
  confirmPurchase,
  executePurchase,
  getTrendingProducts,
} from "../tools/amazon-purchase.js";
import { flags } from "../utils/feature-flags.js";
import falService from "./falService.js";
import {
  EnhancedLLMContext,
  PurchaseErrorGuidance,
  PurchaseFlowEventHandler,
} from "./purchaseFlowEnhancer.js";

dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// **Helper function for common OpenAI completion logic**
export async function createCompletion(systemPrompt, userPrompt, options = {}) {
  const {
    model = "gpt-4o-mini",
    maxTokens = 50,
    temperature = 0.7,
    personaName = null,
    stream = false,
    messages = null,
    tools = null,
    tool_choice = null,
    ...otherOptions
  } = options;

  const completionMessages = messages || [
    {
      role: "system",
      content: personaName
        ? `You are ${personaName}. ${systemPrompt}`
        : systemPrompt,
    },
    { role: "user", content: userPrompt },
  ];

  // Debug logging for vision messages
  const hasVisionContent = completionMessages.some(
    (msg) =>
      Array.isArray(msg.content) &&
      msg.content.some((item) => item.type === "image_url"),
  );

  if (hasVisionContent) {
    logger.info("[VISION] Sending vision request to OpenAI", {
      model,
      messageCount: completionMessages.length,
      component: "createCompletion",
    });
  }

  let completion;
  try {
    const completionParams = {
      model,
      messages: completionMessages,
      max_tokens: maxTokens,
      temperature,
      stream,
      ...otherOptions,
    };

    // Add tools if provided
    if (tools) {
      completionParams.tools = tools;
      if (tool_choice) {
        completionParams.tool_choice = tool_choice;
      }
    }

    completion = await openai.chat.completions.create(completionParams);
  } catch (apiError) {
    logger.error("[VISION] OpenAI API error", {
      error: apiError.message,
      status: apiError.status,
      data: apiError.response?.data,
      hasVisionContent,
      model,
      component: "createCompletion",
    });
    throw apiError;
  }

  if (stream) {
    return completion; // Return the stream for streaming responses
  }

  return completion.choices[0]?.message?.content?.trim();
}

// **Helper function for persona-based responses with fallbacks**
async function generatePersonaResponse(
  avatarId,
  systemPrompt,
  userPrompt,
  fallbackResponse,
  options = {},
) {
  try {
    const persona = await getAvatarPersona(avatarId);
    if (!persona) {
      return fallbackResponse;
    }

    const response = await createCompletion(systemPrompt, userPrompt, {
      ...options,
      personaName: persona.name,
    });

    return response || fallbackResponse;
  } catch (error) {
    logger.error(
      `Error generating ${options.logContext || "persona"} response`,
      {
        error: error.message,
        avatarId,
        component: "llmResponder",
      },
    );
    if (options.alertOnError) {
      systemAlerts.externalServiceError("OpenAI", error);
    }
    return fallbackResponse;
  }
}

// **Helper function for fetching conversation history across all sessions**
async function fetchConversationHistory(userId, avatarId) {
  if (!userId || !avatarId) return [];

  try {
    // Fetch ALL conversation history between this user and avatar
    const historyResult = await pool.query(
      `SELECT transcript, started_at 
       FROM "CallSession" 
       WHERE user_id = $1 
       AND avatar_id = $2
       AND transcript IS NOT NULL
       ORDER BY started_at ASC;`,
      [userId, avatarId],
    );

    // Combine all transcripts into a single conversation history
    let combinedHistory = [];
    let mostRecentImageMessage = null;
    let mostRecentImageIndex = -1;

    // First pass: collect all messages and find the most recent image
    for (const session of historyResult.rows) {
      if (session.transcript && Array.isArray(session.transcript)) {
        for (let i = 0; i < session.transcript.length; i++) {
          const msg = session.transcript[i];
          combinedHistory.push(msg);

          // Check if this message contains an image
          if (
            Array.isArray(msg.content) &&
            msg.content.some((item) => item.type === "image_url")
          ) {
            mostRecentImageMessage = msg;
            mostRecentImageIndex = combinedHistory.length - 1;
          }
        }
      }
    }

    // Second pass: strip out all images except the most recent one AND fix old object content
    combinedHistory = combinedHistory.map((msg, index) => {
      // Fix old workout plan messages with object content (from before the fix)
      if (
        msg.content &&
        typeof msg.content === "object" &&
        !Array.isArray(msg.content)
      ) {
        // Convert old format to string
        if (msg.content.type === "workout_plan" && msg.content.data) {
          return {
            ...msg,
            content: `Workout plan generated: ${JSON.stringify(msg.content.data)}`,
          };
        } else if (
          msg.content.type === "performance_analysis" &&
          msg.content.data
        ) {
          return {
            ...msg,
            content: `Performance analysis: ${JSON.stringify(msg.content.data)}`,
          };
        } else if (msg.content.type === "exercise_event" && msg.content.data) {
          return {
            ...msg,
            content: `Exercise event: ${JSON.stringify(msg.content.data)}`,
          };
        } else {
          // Unknown object format, convert to string
          return {
            ...msg,
            content: `[System event: ${msg.content.type || "unknown"}]`,
          };
        }
      }

      // If this message contains image data and it's not the most recent image
      if (
        Array.isArray(msg.content) &&
        msg.content.some((item) => item.type === "image_url") &&
        index !== mostRecentImageIndex
      ) {
        // Keep only the text content
        const textContent = msg.content.find((item) => item.type === "text");
        if (textContent) {
          return {
            ...msg,
            content: textContent.text || textContent.content || "",
          };
        } else {
          // If no text content found, return a fallback text message
          return {
            ...msg,
            content: "[Image content removed from history]",
          };
        }
      }
      // Keep the message as-is (including the most recent image)
      // However, ensure content is properly formatted for OpenAI API
      if (Array.isArray(msg.content)) {
        // OpenAI expects multimodal content to remain as array - keep as-is
        return msg;
      }
      return msg;
    });

    logger.info("Fetched cross-session history", {
      userId,
      avatarId,
      sessionCount: historyResult.rows.length,
      messageCount: combinedHistory.length,
      hasRecentImage: mostRecentImageIndex >= combinedHistory.length - 100,
      component: "llmResponder",
    });

    return combinedHistory;
  } catch (e) {
    logger.error("Error fetching conversation history", {
      error: e.message,
      userId,
      avatarId,
      component: "llmResponder",
    });
  }
  return [];
}

// **Helper function for updating conversation transcript**
async function updateTranscript(
  callSessionId,
  userMessage,
  fullResponse,
  isProactive,
) {
  if (!fullResponse || !callSessionId) return;

  try {
    let transcriptUpdate;
    if (isProactive) {
      // Only save the assistant's response for proactive messages
      transcriptUpdate = [{ role: "assistant", content: fullResponse }];
    } else {
      // Normal conversation - save both user and assistant messages
      transcriptUpdate = [
        { role: "user", content: userMessage },
        { role: "assistant", content: fullResponse },
      ];
    }

    await pool.query(
      `UPDATE "CallSession"
       SET transcript = transcript || $1::jsonb
       WHERE id = $2;`,
      [JSON.stringify(transcriptUpdate), callSessionId],
    );
    logger.info("Transcript updated", {
      callSessionId,
      isProactive,
      component: "llmResponder",
    });
  } catch (e) {
    logger.error("Error updating transcript", {
      error: e.message,
      callSessionId,
      component: "llmResponder",
    });
  }
}

// **Helper function for handling streaming responses**
async function handleStreamingResponse(
  stream,
  socket,
  avatarId,
  streamHandler,
  callSessionId = null,
  persona = null,
  userId = null,
) {
  let fullResponse = "";
  let functionCall = null;
  let functionArgs = "";

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta;

    // Handle regular content
    const content = delta?.content || "";
    if (content) {
      fullResponse += content;

      // Emit streaming content to client for thinking state
      socket.emit("llm_response_chunk", {
        content,
        avatarId,
        complete: false,
      });

      // Pass chunk to the stream handler if it exists
      if (streamHandler?.onChunk) {
        await streamHandler.onChunk(content);
      }
    }

    // Handle function calls
    if (delta?.tool_calls) {
      logger.info("Tool call detected in stream", {
        toolCallsLength: delta.tool_calls.length,
        avatarId,
        component: "llmResponder",
      });

      for (const toolCall of delta.tool_calls) {
        if (toolCall.function) {
          if (toolCall.function.name) {
            functionCall = {
              name: toolCall.function.name,
              id: toolCall.id,
            };
            logger.info("Function name detected", {
              functionName: toolCall.function.name,
              avatarId,
              component: "llmResponder",
            });
          }
          if (toolCall.function.arguments) {
            functionArgs += toolCall.function.arguments;
          }
        }
      }
    }

    // Check for completion
    if (chunk.choices[0]?.finish_reason === "tool_calls" && functionCall) {
      // Parse function arguments
      let args;
      try {
        args = JSON.parse(functionArgs);
      } catch (parseError) {
        logger.error("Failed to parse function arguments", {
          error: parseError.message,
          functionArgs: functionArgs,
          component: "llmResponder",
        });

        // Check if it's multiple function calls concatenated
        if (functionArgs.includes("}{")) {
          // Extract the first valid JSON object
          const firstBrace = functionArgs.indexOf("}");
          const firstJson = functionArgs.substring(0, firstBrace + 1);
          try {
            args = JSON.parse(firstJson);
            logger.info(
              "Extracted first function call from multiple attempts",
              {
                extractedArgs: args,
                component: "llmResponder",
              },
            );
          } catch (e) {
            logger.error("Failed to extract first function call", {
              error: e.message,
              component: "llmResponder",
            });
            args = {};
          }
        } else {
          args = {};
        }
      }
      functionCall.arguments = args;

      logger.info("Function call detected", {
        functionName: functionCall.name,
        avatarId,
        callSessionId,
        component: "llmResponder",
      });

      console.log("=== FUNCTION CALL DETECTED ===");
      console.log("Function name:", functionCall.name);
      console.log("Function args:", JSON.stringify(args, null, 2));
      console.log("Available function handlers:", [
        "generate_style_suggestion",
        "get_trending_products", // Only this Amazon function now available
      ]);
      console.log("Call session ID exists:", !!callSessionId);

      // Handle style generation function
      if (
        functionCall.name === "generate_style_suggestion" &&
        callSessionId &&
        persona?.category === "stylist"
      ) {
        // Get the last captured image from the socket
        let lastImageUrl = getLastCapturedImage(socket);

        // If no image in current socket session, try to get from conversation history
        if (!lastImageUrl && userId && avatarId) {
          lastImageUrl = await getLastImageFromHistory(userId, avatarId);
        }

        if (lastImageUrl) {
          // Generate a unique message ID for tracking
          const generatingMessageId = `style-gen-${Date.now()}`;

          // Use the LLM's actual response if it provided one, otherwise use a fallback
          if (!fullResponse || fullResponse.trim() === "") {
            fullResponse = "Let me create that look for you...";
          }

          // Emit the LLM's contextual response
          socket.emit("llm_response_complete", {
            fullResponse,
            avatarId,
            complete: true,
            styleGeneration: {
              type: "feedback",
              generatingMessageId,
              prompt: args.suggestion_prompt,
            },
          });

          // Trigger style generation (this will emit the image when ready)
          triggerStyleGeneration(
            lastImageUrl,
            args.suggestion_prompt,
            avatarId,
            callSessionId,
            socket,
            generatingMessageId,
            args.use_reference_outfit || false,
            args.reference_outfit_index,
          ).catch((error) => {
            logger.error("Style generation failed in background", {
              error: error.message,
              avatarId,
              component: "llmResponder",
            });
          });
        } else {
          // No image available, respond with text
          fullResponse =
            "I'd love to give you a style suggestion, but I need to see your current outfit first. Could you make sure your camera is on?";
        }
      }

      // Handle Amazon purchase functions
      else if (functionCall.name === "get_trending_products" && callSessionId) {
        try {
          logger.info("Getting trending products", {
            callSessionId,
            avatarId,
            component: "llmResponder",
          });

          console.log("=== TRENDING PRODUCTS FUNCTION CALLED ===");
          console.log("Session ID:", callSessionId);
          console.log("Avatar ID:", avatarId);
          console.log("Socket exists:", !!socket);

          const products = await getTrendingProducts(callSessionId);

          console.log("Products fetched:", products.length);
          console.log("Products data:", JSON.stringify(products, null, 2));

          // Track purchase flow state
          PurchaseFlowEventHandler.handleProductsDisplayed(
            socket,
            callSessionId,
            {
              productCount: products.length,
              avatarId,
              timestamp: Date.now(),
            },
          );

          // Emit products display event
          socket.emit("products-display", {
            products,
            sessionId: callSessionId,
            timestamp: Date.now(),
          });

          console.log("=== SOCKET EVENT EMITTED: products-display ===");

          // Generate a response about the products
          if (products.length > 0) {
            const productList = products
              .map((p) => `${p.name} for $${p.price}`)
              .join(", ");
            fullResponse = `Here are some trending products you might like: ${productList}. Click on any item you'd like to purchase - the modal will handle all payment options including crypto and Apple Pay!`;
          } else {
            fullResponse =
              "I'm sorry, but the shopping feature isn't available right now. Let's talk about something else!";
          }
        } catch (error) {
          logger.error("Error getting trending products", {
            error: error.message,
            callSessionId,
            avatarId,
            component: "llmResponder",
          });
          fullResponse =
            "I'm having trouble accessing the product catalog right now. Let's try again later!";
        }
      }

      // Emit completion for function calls and trigger TTS
      if (streamHandler?.onChunk) {
        await streamHandler.onChunk(fullResponse);
      }
      if (streamHandler?.onComplete) {
        await streamHandler.onComplete();
      }

      socket.emit("llm_response_complete", {
        fullResponse,
        avatarId,
        complete: true,
      });
      break; // Exit the loop after handling function call
    } else if (chunk.choices[0]?.finish_reason === "stop") {
      // Normal completion
      if (streamHandler?.onComplete) {
        await streamHandler.onComplete();
      }

      socket.emit("llm_response_complete", {
        fullResponse,
        avatarId,
        complete: true,
      });
      logger.info("LLM response completed", {
        avatarId,
        responseLength: fullResponse.length,
        component: "llmResponder",
      });
    }
  }

  return fullResponse;
}

// **NEW: Interruption Response Generator**
export async function generateInterruptionResponse(
  avatarId,
  interruptionContext = {},
) {
  const { partialTranscript, interruptionType } = interruptionContext;

  const persona = await getAvatarPersona(avatarId);
  const genericResponses = ["Oh, sorry!", "Oops!", "My bad!", "Sorry!", "Oh!"];

  if (!persona) {
    return genericResponses[
      Math.floor(Math.random() * genericResponses.length)
    ];
  }

  const systemPrompt = `You were just interrupted while speaking.

Interruption context:
- User started saying: "${partialTranscript || "something"}"
- Interruption type: ${interruptionType || "during_speech"}
- Your personality: ${persona.personality?.tone || "professional"}

Generate a brief, natural interruption response (just a few words max) based on the interruption type:

If "during_speech": Show surprise and yield gracefully
- "Oh, sorry!"
- "Oops!"
- "My bad!"

If "during_thinking": Acknowledge and invite continuation
- "Oh, yes?"
- "Go ahead!"
- "What's up?"

If "false_start": Be more apologetic for poor timing
- "Sorry!"
- "Oh no, you first!"
- "My mistake!"

If "clarification": Show understanding they need to interject
- "Oh?"
- "Yes?"
- "What is it?"

Keep it brief, natural, and match your personality. Don't repeat what the user said.`;

  return generatePersonaResponse(
    avatarId,
    systemPrompt,
    "Generate an interruption response now.",
    "Oh, sorry! Please go ahead.",
    { temperature: 0.8, alertOnError: true, logContext: "interruption" },
  );
}



// **Amazon Purchase Tool Definitions**
function getAmazonPurchaseTools() {
  return [
    {
      type: "function",
      function: {
        name: "get_trending_products",
        description:
          "MANDATORY: Call this function when users ask about trending products, popular items, what they can buy, shopping, or any product-related queries. This function opens the comprehensive purchase modal that handles product discovery, real-time pricing, and complete payment flow including crypto and Apple Pay options. The modal manages the entire purchase experience, so ALWAYS call this function for any shopping-related requests rather than attempting verbal purchases.",
        parameters: {
          type: "object",
          properties: {},
          required: [],
        },
      },
    },
  ];
}

export async function generateLLMResponse(
  userMessage,
  avatarId,
  socket,
  callSessionId,
  streamHandler = null,
  additionalContext = [],
  isProactive = false,
  userId = null,
) {
  /**
   * Generates a response from an LLM based on the user's transcription, handles streaming back to the client,
   * and logs the conversation turn to the database.
   * @param {string} userMessage - The user's transcribed text.
   * @param {string} avatarId - The ID of the avatar persona.
   * @param {Socket} socket - The client's socket.io connection.
   * @param {number} callSessionId - The ID of the current call session.
   * @param {Object} streamHandler - Optional handler for streaming chunks.
   * @param {Array} additionalContext - Additional context messages.
   * @param {boolean} isProactive - Whether this is a proactive message.
   * @returns {Promise<string>} - The LLM's full response text.
   */

  // Debug logging for vision
  const hasImageContent =
    Array.isArray(userMessage) &&
    userMessage.some((item) => item.type === "image_url");
  logger.info("generateLLMResponse called", {
    avatarId,
    hasImageContent,
    messageType: typeof userMessage,
    isProactive,
    hasStreamHandler: !!streamHandler,
    streamHandlerType: streamHandler ? typeof streamHandler : "null",
    component: "llmResponder",
  });

  try {
    const persona = await getAvatarPersona(avatarId);
    if (!persona) {
      throw new Error(`Avatar persona not found for ID: ${avatarId}`);
    }

    // Fetch conversation history across all sessions
    const history = await fetchConversationHistory(userId, avatarId);

    // Build messages with system prompt, history, additional context, and user message
    let systemPromptContent = persona.systemPrompt;

    // Add enhanced purchase flow context
    systemPromptContent = EnhancedLLMContext.generateContextualPrompt(
      callSessionId,
      systemPromptContent,
    );

    // Add visual transformation instructions for stylists
    if (persona.category === "stylist") {
      systemPromptContent += `

IMPORTANT: You have the ability to generate visual style transformations. When users ask for specific styling changes or want to see how they would look different, you MUST show them a visual transformation of their outfit. 

CRITICAL INSTRUCTIONS - YOU MUST FOLLOW THESE:
- ANY request for a style change, outfit suggestion, or transformation REQUIRES you to call the generate_style_suggestion function
- When users say phrases like "something sexier", "something more conservative", "show me", "now?", "how about now?", "go ahead" - these ALL require function calls
- You MUST call generate_style_suggestion for ANY of these requests:
  • "Something sexier/more casual/more formal/etc"
  • "Show me"
  • "Now?"
  • "How about now?"
  • "Go ahead"
  • "Can you show"
  • "Transform my outfit"
  • "Style me differently"
  • ANY request that implies wanting to see a visual change
- NEVER just respond with text when visual transformation is requested
- ALWAYS use the function when discussing outfit changes`;

      // Add reference outfit context if available
      if (
        persona.referenceOutfits &&
        Array.isArray(persona.referenceOutfits) &&
        persona.referenceOutfits.length > 0
      ) {
        const outfitDescriptions = persona.referenceOutfits
          .map((outfit) => {
            const brandInfo = outfit.brand ? `${outfit.brand} - ` : "";
            return `${brandInfo}${outfit.name}`;
          })
          .join(", ");

        systemPromptContent += `

You have ${persona.referenceOutfits.length} reference outfit${persona.referenceOutfits.length > 1 ? "s" : ""} in your collection: ${outfitDescriptions}.
        
When deciding whether to use reference outfits:
- USE REFERENCE OUTFITS (use_reference_outfit: true) when:
  • User mentions specific brands from your collection
  • User asks to "try on" or "show me in" specific items
  • User wants to see exact pieces from your collection
  • User references specific outfits you've mentioned
  
- USE AI TRANSFORMATION (use_reference_outfit: false) when:
  • User asks for general style advice or transformations
  • User describes a style without mentioning specific brands
  • User wants creative or conceptual styling
  • You need to modify just part of their outfit`;
      }
    }

    const messages = [
      {
        role: "system",
        content: systemPromptContent,
      },
      ...history,
      ...additionalContext, // Include vision context or other additional messages
    ];

    // Add continuity instruction for stylists
    if (persona.category === "stylist") {
      messages.push({
        role: "system",
        content:
          "Continue this conversation naturally. When the user asks for style suggestions or transformations, use the generate_style_suggestion function to show them the visual result. Focus on being helpful and actually generating the requested styles.",
      });
    }

    messages.push({
      role: "user",
      content: userMessage,
    });

    // Debug log for vision messages
    if (Array.isArray(userMessage)) {
      logger.info("Processing multimodal message", {
        hasImage: userMessage.some((m) => m.type === "image_url"),
        messageTypes: userMessage.map((m) => m.type),
        component: "llmResponder",
      });
    }

    socket.emit("llm_response_start", { avatarId });

    // Log the messages being sent to OpenAI
    logger.info("Sending to OpenAI", {
      messageCount: messages.length,
      lastMessageType: typeof messages[messages.length - 1].content,
      hasImageInLastMessage:
        Array.isArray(messages[messages.length - 1].content) &&
        messages[messages.length - 1].content.some(
          (item) => item.type === "image_url",
        ),
      component: "llmResponder",
    });

    // DEBUG: Log all messages being sent to OpenAI to find object content
    messages.forEach((msg, index) => {
      if (
        msg.content &&
        typeof msg.content === "object" &&
        !Array.isArray(msg.content)
      ) {
        console.log(
          `ERROR: Message[${index}] has invalid object content:`,
          JSON.stringify(msg.content).substring(0, 500),
        );
      }
      if (typeof msg.content === "object") {
        console.log(
          `DEBUG: Message[${index}] content is object:`,
          JSON.stringify(msg.content, null, 2),
        );
      }
    });

    // Prepare completion options
    const completionOptions = {
      stream: true,
      temperature: 0.7,
      maxTokens: 500,
      presence_penalty: 0.1,
      frequency_penalty: 0.1,
      messages: messages,
    };

    // Add tools based on avatar category and feature flags
    const tools = [];

    // Add style generation tool for AI stylists
    if (persona.category === "stylist") {
      const styleTool = getStyleGenerationTool(persona);
      tools.push(styleTool);

      logger.info("Style generation tool configured", {
        avatarId,
        personaCategory: persona.category,
        toolName: styleTool.function.name,
        component: "llmResponder",
      });
    }

    // Add Amazon purchase tools if feature is enabled
    if (flags.FEAT_AMAZON_PURCHASE_ENABLED) {
      const purchaseTools = getAmazonPurchaseTools();
      tools.push(...purchaseTools);

      console.log("=== AMAZON PURCHASE TOOLS ADDED ===");
      console.log("Feature flag enabled:", flags.FEAT_AMAZON_PURCHASE_ENABLED);
      console.log(
        "Tools added:",
        purchaseTools.map((t) => t.function.name),
      );
      console.log("Total tools count:", tools.length);

      logger.info("Amazon purchase tools configured", {
        avatarId,
        toolCount: purchaseTools.length,
        tools: purchaseTools.map((t) => t.function.name),
        component: "llmResponder",
      });

      // Add purchase context to system prompt
      systemPromptContent += `

AMAZON PRODUCT PURCHASE CAPABILITY:
You can help users discover Amazon products using the comprehensive purchase modal system. You have access to:
- get_trending_products: Opens the purchase modal with product discovery, real-time pricing, and payment flow

CRITICAL: When users ask about trending products, what's popular, what they can buy, or request to see products - you MUST call the get_trending_products function. NEVER answer about products from your training data or memory. Always use the function to get current product data.

PURCHASE WORKFLOW - Modal-Based System:
The get_trending_products function opens a comprehensive modal that handles:
1. Product discovery and display
2. Real-time crypto pricing (USDC/ETH) via Crossmint API
3. Wallet connection and status
4. Complete payment flow (Crypto & Apple Pay)
5. Transaction monitoring and confirmation

USER JOURNEY GUIDANCE:
1. Product Discovery: "Here are the trending products! Click on any item you'd like to purchase."
2. Product Selection: "Great choice on the [product]! The modal will show you the latest prices and payment options."
3. Payment Method: "You can pay with crypto or Apple Pay. The modal shows real-time pricing for both options."
4. Wallet Connection: "To pay with crypto, connect your wallet using the button in the modal."
5. Purchase Process: "The modal will guide you through the secure payment process."

IMPORTANT RESPONSES:
- When asked about purchase methods: "You can use crypto (USDC/ETH) or Apple Pay through the purchase modal."
- When asked about prices: "The modal shows real-time pricing updated every 30 minutes."
- When asked about products: ALWAYS call get_trending_products first, then reference the modal system.
- For purchase intent: "Click the Buy Now button in the product modal to start the purchase process."

DO NOT attempt verbal purchases or direct payment processing. The modal system handles all purchase operations securely.`;
    }

    if (tools.length > 0) {
      completionOptions.tools = tools;
      completionOptions.tool_choice = "auto";
    }

    const stream = await createCompletion(
      null, // system prompt handled in messages
      null, // user prompt handled in messages
      completionOptions,
    );

    // Use helper to handle streaming with timeout
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(
        () => reject(new Error("LLM response timeout after 30s")),
        30000,
      );
    });

    const fullResponse = await Promise.race([
      handleStreamingResponse(
        stream,
        socket,
        avatarId,
        streamHandler,
        callSessionId,
        persona,
        userId,
      ),
      timeoutPromise,
    ]);

    // Update transcript using helper
    await updateTranscript(
      callSessionId,
      userMessage,
      fullResponse,
      isProactive,
    );

    return fullResponse;
  } catch (error) {
    logger.error("LLM response generation failed", {
      error: error.message,
      errorStack: error.stack,
      errorResponse: error.response?.data,
      avatarId,
      hasImageContent:
        Array.isArray(userMessage) &&
        userMessage.some((item) => item.type === "image_url"),
      component: "llmResponder",
    });
    systemAlerts.externalServiceError("OpenAI", error);
    socket.emit("llm_response_error", {
      error: "Failed to generate response",
      avatarId,
    });

    // Return fallback response
    return "I apologize, but I'm having trouble processing your request right now. Could you please try again?";
  }
}

// **Helper function to get last captured image from socket**
function getLastCapturedImage(socket) {
  // Check if we have a recent image (within last 5 minutes)
  if (
    socket.lastVisionImage &&
    Date.now() - socket.lastVisionImage.timestamp < 300000
  ) {
    // Return base64 data URL for fal.ai
    logger.info("Found captured image for style generation", {
      hasImage: true,
      imageTimestamp: socket.lastVisionImage.timestamp,
      timeSinceCapture: Date.now() - socket.lastVisionImage.timestamp,
      component: "llmResponder",
    });
    return `data:image/jpeg;base64,${socket.lastVisionImage.data}`;
  }
  logger.warn("No recent captured image found for style generation", {
    hasLastVisionImage: !!socket.lastVisionImage,
    component: "llmResponder",
  });
  return null;
}

// **Helper function to get last image from conversation history**
async function getLastImageFromHistory(userId, avatarId) {
  try {
    const history = await fetchConversationHistory(userId, avatarId);

    // Find the most recent image in the history
    for (let i = history.length - 1; i >= 0; i--) {
      const msg = history[i];
      if (Array.isArray(msg.content)) {
        const imageContent = msg.content.find(
          (item) => item.type === "image_url",
        );
        if (
          imageContent &&
          imageContent.image_url &&
          imageContent.image_url.url
        ) {
          logger.info(
            "Found image from conversation history for style generation",
            {
              messageIndex: i,
              totalMessages: history.length,
              component: "llmResponder",
            },
          );
          return imageContent.image_url.url;
        }
      }
    }

    logger.warn("No image found in conversation history", {
      historyLength: history.length,
      component: "llmResponder",
    });
    return null;
  } catch (error) {
    logger.error("Error fetching image from history", {
      error: error.message,
      component: "llmResponder",
    });
    return null;
  }
}

// **Helper function to trigger style generation**
async function triggerStyleGeneration(
  imageUrl,
  prompt,
  avatarId,
  callSessionId,
  socket,
  generatingMessageId = null,
  useReferenceOutfit = false,
  referenceOutfitIndex = null,
) {
  try {
    logger.info("Triggering style generation", {
      avatarId,
      callSessionId,
      promptLength: prompt.length,
      useReferenceOutfit,
      component: "llmResponder",
    });

    // Get the persona to check for reference outfits
    const persona = await getAvatarPersona(avatarId);
    let referenceImageUrls = [];

    // Only extract reference image URLs if explicitly requested and available
    if (
      useReferenceOutfit &&
      persona?.referenceOutfits &&
      Array.isArray(persona.referenceOutfits) &&
      persona.referenceOutfits.length > 0
    ) {
      // Get reference images that match the prompt context
      // For now, we'll use a simple keyword matching approach
      const promptLower = prompt.toLowerCase();

      // Try to find matching outfits based on brand, tags, name, or description
      const matchingOutfits = persona.referenceOutfits.filter((outfit) => {
        // Check brand first (highest priority)
        if (outfit.brand && promptLower.includes(outfit.brand.toLowerCase())) {
          return true;
        }
        // Check outfit name
        if (outfit.name && promptLower.includes(outfit.name.toLowerCase())) {
          return true;
        }
        // Check tags
        if (outfit.tags && Array.isArray(outfit.tags)) {
          return outfit.tags.some((tag) =>
            promptLower.includes(tag.toLowerCase()),
          );
        }
        // Check description
        if (outfit.description) {
          const descWords = outfit.description.toLowerCase().split(" ");
          return descWords.some(
            (word) => word.length > 3 && promptLower.includes(word),
          );
        }
        return false;
      });

      // If we found matching outfits, use them; otherwise use all outfits
      const outfitsToUse =
        matchingOutfits.length > 0 ? matchingOutfits : persona.referenceOutfits;

      // Use the outfit index provided by LLM, or default to first outfit
      let selectedOutfit = null;
      if (referenceOutfitIndex !== null && referenceOutfitIndex !== undefined) {
        // LLM provided a specific index
        if (
          referenceOutfitIndex >= 0 &&
          referenceOutfitIndex < persona.referenceOutfits.length
        ) {
          selectedOutfit = persona.referenceOutfits[referenceOutfitIndex];
          logger.info("Using LLM-selected outfit by index", {
            index: referenceOutfitIndex,
            outfit: selectedOutfit.name,
            brand: selectedOutfit.brand,
            component: "llmResponder",
          });
        } else {
          logger.warn("Invalid outfit index from LLM", {
            index: referenceOutfitIndex,
            availableCount: persona.referenceOutfits.length,
            component: "llmResponder",
          });
        }
      }

      // Fall back to first matching outfit if no valid index
      if (!selectedOutfit && outfitsToUse.length > 0) {
        selectedOutfit = outfitsToUse[0];
      }

      // Extract image URL from the selected outfit
      referenceImageUrls = selectedOutfit
        ? [selectedOutfit.imageUrl].filter((url) => url)
        : [];

      logger.info("Found reference outfits for style generation", {
        totalReferenceOutfits: persona.referenceOutfits.length,
        matchingOutfits: matchingOutfits.length,
        usingReferenceImages: referenceImageUrls.length,
        selectedOutfit: outfitsToUse[0]?.name || "unknown",
        selectedBrand: outfitsToUse[0]?.brand || "unknown",
        component: "llmResponder",
      });
    } else {
      logger.info("Style generation mode", {
        useReferenceOutfit,
        hasReferenceOutfits: !!persona?.referenceOutfits?.length,
        reason: !useReferenceOutfit
          ? "LLM chose text-based generation"
          : "No reference outfits available",
        component: "llmResponder",
      });
    }

    // Call the style generation service with reference images
    const result = await falService.generateStyleSuggestion(
      imageUrl,
      prompt,
      avatarId,
      callSessionId,
      referenceImageUrls,
    );

    // Log to database
    await pool.query(
      `INSERT INTO style_generations (session_id, avatar_id, original_image_url, generated_image_url, prompt, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())`,
      [callSessionId, avatarId, imageUrl, result.generatedImageUrl, prompt],
    );

    // Emit the generated image through llm_response_complete like music generation
    socket.emit("llm_response_complete", {
      fullResponse: "Here's your fresh new look! 🎨",
      avatarId,
      complete: true,
      styleGeneration: {
        type: "completion",
        imageUrl: result.generatedImageUrl,
        description: "AI-generated style suggestion",
        prompt: prompt,
        generatingMessageId,
      },
    });

    logger.info("Style generation completed", {
      avatarId,
      callSessionId,
      component: "llmResponder",
    });

    // Generate a response from the LLM about the style suggestion
    const styleResponsePrompt = `You just created a visual style transformation for the user. The transformation was: "${prompt}". 
    
    Respond in EXACTLY 15 words or less. Be encouraging about the style change.`;

    try {
      const styleResponse = await createCompletion(
        persona.systemPrompt,
        styleResponsePrompt,
        {
          model: persona.model || "gpt-4o-mini",
          maxTokens: 150,
          temperature: 0.8,
        },
      );

      // Emit the completion message with the generated image
      socket.emit("llm_response_complete", {
        fullResponse: styleResponse,
        avatarId,
        complete: true,
        styleGeneration: {
          type: "completion",
          imageUrl: result.generatedImageUrl,
          description: result.transformation,
          generatingMessageId,
        },
      });

      // Don't save here - the response is already saved by updateTranscript in the main flow

      // Also trigger TTS for the response
      if (socket.ttsEnabled) {
        const voiceSettings = getVoiceSettingsForPersona(persona);
        await publishTTS(socket, styleResponse, voiceSettings);
      }
    } catch (error) {
      logger.error("Failed to generate style response", {
        error: error.message,
        avatarId,
        callSessionId,
      });

      // Fallback response
      const fallbackResponse =
        "Here's your new look! I've transformed your outfit as requested. This style gives you a more polished and contemporary appearance.";
      socket.emit("llm_response_complete", {
        fullResponse: fallbackResponse,
        avatarId,
        complete: true,
        styleGeneration: {
          type: "completion",
          imageUrl: result.generatedImageUrl,
          description: result.transformation,
          generatingMessageId,
        },
      });
    }
  } catch (error) {
    logger.error("Failed to generate style suggestion", {
      error: error.message,
      avatarId,
      callSessionId,
      component: "llmResponder",
    });

    // Emit error to client
    socket.emit("style_suggestion_error", {
      avatarId,
      error: "Failed to generate style suggestion",
    });
  }
}
