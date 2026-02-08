import express from "express";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

const GOOGLE_PLACES_KEY = process.env.GOOGLE_PLACES_KEY;
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_VOICE_ID_MALE = process.env.ELEVENLABS_VOICE_ID_MALE;
const ELEVENLABS_VOICE_ID_FEMALE = process.env.ELEVENLABS_VOICE_ID_FEMALE;

const getVoiceId = (gender) => {
  if (gender === "male") return ELEVENLABS_VOICE_ID_MALE;
  return ELEVENLABS_VOICE_ID_FEMALE;
};

let cachedFallbackVoiceId = null;
const getFallbackVoiceId = async () => {
  if (cachedFallbackVoiceId) return cachedFallbackVoiceId;
  if (!ELEVENLABS_API_KEY) return null;
  try {
    const r = await fetch("https://api.elevenlabs.io/v1/voices", {
      headers: { "xi-api-key": ELEVENLABS_API_KEY },
    });
    if (!r.ok) return null;
    const data = await r.json();
    const voice = data?.voices?.[0];
    cachedFallbackVoiceId = voice?.voice_id || null;
    return cachedFallbackVoiceId;
  } catch {
    return null;
  }
};

const fetchPlaceReviews = async (placeId) => {
  if (!placeId || !GOOGLE_PLACES_KEY) return [];
  const r = await fetch(`https://places.googleapis.com/v1/places/${placeId}`, {
    headers: {
      "X-Goog-Api-Key": GOOGLE_PLACES_KEY,
      "X-Goog-FieldMask": "reviews",
    },
  });
  if (!r.ok) return [];
  const data = await r.json();
  return data?.reviews || [];
};

const parseGeminiJson = (text) => {
  if (!text) return null;
  try {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start === -1 || end === -1) return null;
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
};

app.post("/api/places", async (req, res) => {
  try {
    const { lat, lng, radiusMeters = 2000 } = req.body || {};
    console.log("[places] request body", req.body);
    if (!GOOGLE_PLACES_KEY) return res.status(400).json({ error: "Missing GOOGLE_PLACES_KEY" });
    if (typeof lat !== "number" || typeof lng !== "number") {
      return res.status(400).json({ error: "Missing lat/lng" });
    }

    const body = {
      includedTypes: ["restaurant"],
      maxResultCount: 20,
      locationRestriction: {
        circle: { center: { latitude: lat, longitude: lng }, radius: radiusMeters },
      },
    };

    console.log("[places] calling google...");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const r = await fetch("https://places.googleapis.com/v1/places:searchNearby", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": GOOGLE_PLACES_KEY,
        "X-Goog-FieldMask":
          "places.id,places.displayName,places.location,places.formattedAddress,places.types,places.rating,places.userRatingCount,places.websiteUri,places.nationalPhoneNumber,places.internationalPhoneNumber,places.regularOpeningHours,places.priceLevel,places.googleMapsUri,places.businessStatus,places.editorialSummary",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const data = await r.json();
    console.log("[places] google call complete");
    console.log("[places] status", r.status);
    console.log("[places] body", JSON.stringify(data));
    return res.status(r.status).json(data);
  } catch (e) {
    console.log("[places] error", String(e?.message || e));
    return res.status(500).json({ error: String(e?.message || e) });
  }
});

app.get("/api/youtube/search", async (req, res) => {
  try {
    const { q } = req.query;
    if (!YOUTUBE_API_KEY) return res.status(400).json({ error: "Missing YOUTUBE_API_KEY" });
    if (!q) return res.status(400).json({ error: "Missing q" });

    const url =
      "https://www.googleapis.com/youtube/v3/search" +
      `?part=snippet&type=video&maxResults=3&q=${encodeURIComponent(q)}&key=${YOUTUBE_API_KEY}`;

    const r = await fetch(url);
    const data = await r.json();
    return res.status(r.status).json(data);
  } catch (e) {
    return res.status(500).json({ error: String(e?.message || e) });
  }
});

app.post("/api/voice-summary", async (req, res) => {
  try {
    console.log("[voice] request received");
    const { place, quiz, voiceGender } = req.body || {};
    if (!GEMINI_API_KEY) return res.status(400).json({ error: "Missing GEMINI_API_KEY" });
    if (!ELEVENLABS_API_KEY) return res.status(400).json({ error: "Missing ELEVENLABS_API_KEY" });
    let voiceId = getVoiceId(voiceGender);
    if (!voiceId) {
      voiceId = await getFallbackVoiceId();
    }
    if (!voiceId) return res.status(400).json({ error: "Missing ElevenLabs voice ID" });
    if (!place?.id || !place?.name) return res.status(400).json({ error: "Missing place" });

    const reviews = await fetchPlaceReviews(place.id);
    console.log(`[voice] reviews fetched: ${reviews.length}`);
    const reviewLines = reviews.slice(0, 8).map((r, idx) => {
      const text = r?.text?.text || r?.text || "";
      const rating = r?.rating ?? "n/a";
      return `Review ${idx}: rating ${rating} - ${text}`;
    });

    const quizText =
      `Diet: ${quiz?.diet || "Unknown"}. ` +
      `Budget: ${quiz?.budget || "Unknown"}. ` +
      `Priorities: ${(quiz?.priorities || []).join(", ") || "None"}.`;
    const placeText =
      `Place: ${place.name}. Score: ${place.score}/100. ` +
      `Rating: ${place.rating ?? "N/A"} (${place.ratingCount ?? "N/A"} reviews). ` +
      `Cuisine: ${place.tags?.cuisine || "Unknown"}. ` +
      `Price level: ${place.tags?.priceLevel || "Unknown"}. ` +
      `Open now: ${place.tags?.openNow === undefined ? "Unknown" : place.tags?.openNow ? "Yes" : "No"}.`;

    const prompt =
      "You are a concise sustainability dining guide. " +
      "Given the quiz and reviews, pick ONE review that best matches the user. " +
      "Then write a short spoken summary (40-70 words) that says the restaurant name, " +
      "mentions sustainability fit, and gives a personal opinion on fit for the user. " +
      "Return ONLY JSON with keys review_index and script. If no reviews, use review_index -1 and still write script.\n\n" +
      `Quiz: ${quizText}\n` +
      `Place: ${placeText}\n` +
      (reviewLines.length ? `Reviews:\n${reviewLines.join("\n")}` : "Reviews: none");

    console.log("[voice] calling gemini...");
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.4, maxOutputTokens: 200, response_mime_type: "application/json" },
        }),
      }
    );
    const geminiData = await geminiRes.json();
    const rawText =
      geminiData?.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") ||
      geminiData?.candidates?.[0]?.content?.parts?.[0]?.text ||
      "";
    const parsed = parseGeminiJson(rawText) || {};
    const reviewSnippet = reviews?.[parsed.review_index]?.text?.text || reviews?.[0]?.text?.text || "";
    const fallbackScript =
      `${place.name} has a sustainability score of ${place.score}/100. ` +
      `Based on your preferences (${quizText}), this looks like a ${place.score >= 70 ? "strong" : "moderate"} fit. ` +
      (reviewSnippet ? `A like-minded review mentions: ${reviewSnippet}` : "Reviews were limited, so this is based on place data.");
    const script = parsed.script && parsed.script.length > 20 ? parsed.script : fallbackScript;
    console.log("[voice] gemini done");

    const ttsRequest = (id) =>
      fetch(`https://api.elevenlabs.io/v1/text-to-speech/${id}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "xi-api-key": ELEVENLABS_API_KEY,
          Accept: "audio/mpeg",
        },
        body: JSON.stringify({
          text: script,
          model_id: "eleven_multilingual_v2",
          voice_settings: { stability: 0.5, similarity_boost: 0.7 },
        }),
      });

    console.log("[voice] calling elevenlabs...");
    let ttsRes = await ttsRequest(voiceId);
    if (!ttsRes.ok) {
      const ttsErr = await ttsRes.text();
      const needsFallback = /payment_required|library voices/i.test(ttsErr);
      if (needsFallback) {
        const fallbackId = await getFallbackVoiceId();
        if (fallbackId && fallbackId !== voiceId) {
          console.log("[voice] retrying with fallback voice");
          ttsRes = await ttsRequest(fallbackId);
        }
      }
      if (!ttsRes.ok) {
        const finalErr = await ttsRes.text();
        return res.status(500).json({ error: finalErr || ttsErr || "ElevenLabs TTS failed" });
      }
    }
    console.log("[voice] elevenlabs done");
    const audioBuffer = Buffer.from(await ttsRes.arrayBuffer());
    const audioBase64 = audioBuffer.toString("base64");
    return res.json({ script, audioBase64 });
  } catch (e) {
    return res.status(500).json({ error: String(e?.message || e) });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`API server running at http://localhost:${PORT}`));
