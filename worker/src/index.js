
const MODEL = "gemini-2.5-flash";

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin");
    const allowedOrigin = env.ALLOWED_ORIGIN;

    // CORS headers
    const corsHeaders = {
      "Access-Control-Allow-Origin": allowedOrigin || "null",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Vary": "Origin",
    };

    const json = (data, status = 200) =>
      new Response(JSON.stringify(data), {
        status,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json; charset=utf-8",
        },
      });

    // Allow only the configured website
    if (!allowedOrigin || origin !== allowedOrigin) {
      if (request.method === "OPTIONS") {
        return new Response(null, { status: 403 });
      }
      return json({ error: "Forbidden: website origin not allowed." }, 403);
    }

    // Handle browser CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders,
      });
    }

    if (request.method !== "POST") {
      return json({
        error: "Ghazi AI API is running. Send a POST request from the website."
      }, 405);
    }

    if (!env.GEMINI_API_KEY) {
      return json({ error: "Gemini API key is not configured." }, 500);
    }

    try {
      const body = await request.json();

      const message =
        typeof body.message === "string" ? body.message.trim() : "";

      if (!message) {
        return json({ error: "Please enter a message." }, 400);
      }

      if (message.length > 10000) {
        return json({ error: "Message is too long." }, 413);
      }

      // Previous messages from the frontend
      const history = Array.isArray(body.history)
        ? body.history.slice(-12)
        : [];

      const contents = [];

      for (const item of history) {
        if (
          !item ||
          typeof item.text !== "string" ||
          !["user", "assistant", "model"].includes(item.role)
        ) {
          continue;
        }

        const text = item.text.trim().slice(0, 10000);
        if (!text) continue;

        contents.push({
          role: item.role === "assistant" ? "model" : item.role,
          parts: [{ text }],
        });
      }

      // Current message
      contents.push({
        role: "user",
        parts: [{ text: message }],
      });

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": env.GEMINI_API_KEY,
          },
          body: JSON.stringify({
            systemInstruction: {
              parts: [{
                text:
                  "You are Ghazi AI, a helpful, friendly and intelligent AI assistant. " +
                  "Give clear, useful and accurate answers. " +
                  "For educational questions, explain step by step. " +
                  "Never invent facts when you are unsure."
              }]
            },
            contents,
            generationConfig: {
              temperature: 0.7,
              maxOutputTokens: 2048,
            },
          }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        console.error("Gemini API error:", response.status, result);

        return json({
          error:
            response.status === 429
              ? "Ghazi AI is temporarily busy or the API quota is exhausted. Try again later."
              : "Gemini API request failed. Check your API key and model access."
        }, 502);
      }

      const reply = result.candidates?.[0]?.content?.parts
        ?.map(part => part.text || "")
        .join("")
        .trim();

      if (!reply) {
        return json({
          error: "Ghazi AI received an empty response. Please try again."
        }, 502);
      }

      return json({ reply });

    } catch (error) {
      console.error("Ghazi AI Worker error:", error);

      return json({
        error: "A server error occurred. Please try again."
      }, 500);
    }
  },
};
