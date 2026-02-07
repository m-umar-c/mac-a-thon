import express from "express";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

const GOOGLE_PLACES_KEY = process.env.GOOGLE_PLACES_KEY;
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;

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

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`API server running at http://localhost:${PORT}`));
