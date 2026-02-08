import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./App.css";

const DEFAULT_CENTER = [43.6532, -79.3832]; // Toronto

const DIET_OPTIONS = ["Any", "Vegetarian", "Vegan", "Halal", "Gluten-Free"];
const BUDGET_OPTIONS = ["$", "$$", "$$$"];
const PRIORITIES = [
  { id: "waste", label: "Low Food Waste" },
  { id: "local", label: "Local Sourcing" },
  { id: "plant", label: "Plant-Forward" },
  { id: "value", label: "Best Value" },
];

const MOCK_COMMENTS = [
  "Portions are huge and they donate leftovers.",
  "Seasonal menu, lots of plant-based options.",
  "Great value for money, friendly staff.",
  "They compost and use recyclable packaging.",
];

const CAR_EMISSIONS_G_PER_KM = 192;

const pickRandom = (arr, count = 2) => {
  const copy = [...arr];
  const out = [];
  while (copy.length && out.length < count) {
    const idx = Math.floor(Math.random() * copy.length);
    out.push(copy.splice(idx, 1)[0]);
  }
  return out;
};

const formatPriceLevel = (priceLevel) => {
  if (!priceLevel) return "Not listed";
  const map = {
    PRICE_LEVEL_UNSPECIFIED: "Not listed",
    PRICE_LEVEL_FREE: "Free",
    PRICE_LEVEL_INEXPENSIVE: "$",
    PRICE_LEVEL_MODERATE: "$$",
    PRICE_LEVEL_EXPENSIVE: "$$$",
    PRICE_LEVEL_VERY_EXPENSIVE: "$$$$",
  };
  return map[priceLevel] || priceLevel;
};

const formatBusinessStatus = (status) => {
  if (!status) return "Not listed";
  const map = {
    OPERATIONAL: "Operational",
    CLOSED_TEMPORARILY: "Temporarily closed",
    CLOSED_PERMANENTLY: "Permanently closed",
  };
  return map[status] || status;
};

const scoreRestaurant = (tags, quiz) => {
  let score = 50;
  const reasons = [];

  if (tags?.cuisine) {
    score += 5;
    reasons.push(`Cuisine: ${tags.cuisine}`);
  }
  if (tags?.organic === "yes") {
    score += 12;
    reasons.push("Organic ingredients");
  }
  if (tags?.vegan === "yes" || tags?.vegetarian === "yes") {
    score += 10;
    reasons.push("Plant-forward options");
  }
  if (tags?.local === "yes") {
    score += 10;
    reasons.push("Local sourcing");
  }
  if (quiz.priorities.includes("waste")) {
    score += 6;
    reasons.push("Low-waste focus from quiz");
  }
  if (quiz.priorities.includes("value")) {
    score += quiz.budget === "$" ? 8 : 4;
    reasons.push("Value prioritized");
  }

  if (quiz.diet === "Vegan" && tags?.vegan !== "yes") score -= 8;
  if (quiz.diet === "Vegetarian" && tags?.vegetarian !== "yes") score -= 5;

  score = Math.max(0, Math.min(100, score));
  return { score, reasons };
};

const buildExplanation = (name, score, reasons) => {
  const reasonText = reasons.length ? reasons.join(", ") : "Community review patterns.";
  return `Why ${name} matches: ${reasonText}. Sustainability fit score: ${score}/100.`;
};

function App() {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersRef = useRef([]);

  const [mapReady, setMapReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [places, setPlaces] = useState([]);
  const [selectedPlace, setSelectedPlace] = useState(null);
  const [userLocation, setUserLocation] = useState(null);
  const [routeInfo, setRouteInfo] = useState({ distanceKm: null, durationMin: null, carbonG: null });
  const [youtubeResults, setYoutubeResults] = useState([]);
  const [youtubeStatus, setYoutubeStatus] = useState("idle");
  const [quizStarted, setQuizStarted] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState("idle");
  const [voiceMessage, setVoiceMessage] = useState("");
  const [voiceScript, setVoiceScript] = useState("");

  const [quiz, setQuiz] = useState({
    diet: null,
    budget: null,
    priorities: [],
    maxDistanceKm: 3,
    voiceEnabled: false,
    voiceGender: "female",
  });

  useEffect(() => {
    delete L.Icon.Default.prototype._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
      iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
      shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
    });
  }, []);

  useEffect(() => {
    if (!quizStarted) return;
    if (!mapRef.current || mapInstanceRef.current) return;
    const map = L.map(mapRef.current, { zoomControl: false }).setView(DEFAULT_CENTER, 13);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors",
    }).addTo(map);
    L.control.zoom({ position: "bottomright" }).addTo(map);
    mapInstanceRef.current = map;
    setMapReady(true);
    // Ensure tiles render after the container becomes visible.
    setTimeout(() => map.invalidateSize(), 0);
  }, [quizStarted]);

  useEffect(() => {
    if (!quizStarted) return;
    const map = mapInstanceRef.current;
    if (!map) return;
    const onResize = () => map.invalidateSize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [quizStarted]);

  useEffect(() => {
    if (!navigator.geolocation) {
      setUserLocation(DEFAULT_CENTER);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserLocation([pos.coords.latitude, pos.coords.longitude]);
      },
      () => {
        setUserLocation(DEFAULT_CENTER);
      },
      { enableHighAccuracy: false, timeout: 5000 }
    );
  }, []);

const fetchPlaces = async () => {
    const map = mapInstanceRef.current;
    if (!map) return;
    setLoading(true);
    setError("");

    try {
      const center = map.getCenter();
      const safeLat = Number.isFinite(center?.lat) ? center.lat : DEFAULT_CENTER[0];
      const safeLng = Number.isFinite(center?.lng) ? center.lng : DEFAULT_CENTER[1];
      const res = await fetch("http://localhost:3001/api/places", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lat: safeLat,
          lng: safeLng,
          radiusMeters: 2000,
        }),
      });
      if (!res.ok) throw new Error("Failed to reach Places API");
      const data = await res.json();
      const formatted = (data.places || []).map((p, idx) => {
        const tags = {
          cuisine: p.types?.[0],
          website: p.websiteUri,
          address: p.formattedAddress,
          phone: p.nationalPhoneNumber || p.internationalPhoneNumber,
          openNow: p.regularOpeningHours?.openNow,
          hours: p.regularOpeningHours?.weekdayDescriptions,
          priceLevel: p.priceLevel,
          mapsUri: p.googleMapsUri,
          businessStatus: p.businessStatus,
          summary: p.editorialSummary?.text,
        };
        const name = p.displayName?.text || "Unknown Spot";
        const { score, reasons } = scoreRestaurant(tags, quiz);
        return {
          id: p.id || `${name}-${idx}`,
          name,
          lat: p.location?.latitude,
          lon: p.location?.longitude,
          tags,
          score,
          reasons,
          comments: pickRandom(MOCK_COMMENTS, 2),
          rating: p.rating,
          ratingCount: p.userRatingCount,
        };
      });
      setPlaces(formatted);
      setSelectedPlace(formatted[0] || null);
    } catch (err) {
      setError(err.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  const fetchRoute = async (origin, destination) => {
    if (!origin || !destination) return;
    try {
      const url = `https://router.project-osrm.org/route/v1/driving/${origin[1]},${origin[0]};${destination[1]},${destination[0]}?overview=false`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("OSRM routing failed");
      const data = await res.json();
      const route = data?.routes?.[0];
      if (!route) throw new Error("No route found");
      const distanceKm = route.distance / 1000;
      const durationMin = route.duration / 60;
      const carbonG = Math.round(distanceKm * CAR_EMISSIONS_G_PER_KM);
      setRouteInfo({ distanceKm, durationMin, carbonG });
    } catch {
      setRouteInfo({ distanceKm: null, durationMin: null, carbonG: null });
    }
  };

  useEffect(() => {
    if (!mapReady || !quizStarted) return;
    fetchPlaces();
  }, [mapReady, quizStarted, quiz.diet, quiz.budget, quiz.priorities.join(","), quiz.maxDistanceKm]);

  const getMarkerColors = (score) => {
    if (score >= 75) return { stroke: "#15803d", fill: "#34d399" };
    if (score >= 50) return { stroke: "#7c3aed", fill: "#c084fc" };
    return { stroke: "#b45309", fill: "#f59e0b" };
  };

  useEffect(() => {
    if (!quizStarted) return;
    const map = mapInstanceRef.current;
    if (!map) return;
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = places.map((place) => {
      const radius = 6 + Math.round((place.score / 100) * 10);
      const colors = getMarkerColors(place.score);
      const marker = L.circleMarker([place.lat, place.lon], {
        radius,
        color: colors.stroke,
        fillColor: colors.fill,
        fillOpacity: 0.85,
        weight: 2,
      }).addTo(map);
      const price = formatPriceLevel(place.tags?.priceLevel);
      const ratingText = place.rating ? `${place.rating} (${place.ratingCount ?? 0})` : "N/A";
      const openText =
        place.tags?.openNow === undefined ? "Hours unknown" : place.tags?.openNow ? "Open now" : "Closed now";
      marker.bindPopup(
        `<strong>${place.name}</strong>` +
          `<br/>Score: ${place.score}/100` +
          `<br/>Rating: ${ratingText}` +
          `<br/>Price: ${price}` +
          `<br/>Status: ${openText}` +
          `<br/>Address: ${place.tags?.address || "Not listed"}`
      );
      marker.on("click", () => {
        setSelectedPlace(place);
        const isPurple = place.score >= 50 && place.score < 75;
        if (quiz.voiceEnabled && isPurple) {
          requestSpokenSummary(place);
        }
      });
      return marker;
    });
  }, [places, quiz.voiceEnabled, quiz.voiceGender]);

  useEffect(() => {
    if (userLocation && selectedPlace) {
      fetchRoute(userLocation, [selectedPlace.lat, selectedPlace.lon]);
    }
  }, [userLocation, selectedPlace]);

  const topPlaces = useMemo(() => {
    return [...places].sort((a, b) => b.score - a.score).slice(0, 8);
  }, [places]);

  const togglePriority = (id) => {
    setQuiz((prev) => {
      const has = prev.priorities.includes(id);
      const priorities = has
        ? prev.priorities.filter((p) => p !== id)
        : [...prev.priorities, id];
      return { ...prev, priorities };
    });
  };

  const quizReady = Boolean(quiz.diet && quiz.budget && quiz.priorities.length);

  const requestSpokenSummary = async (place) => {
    if (!place?.id) return;
    try {
      setVoiceStatus("loading");
      setVoiceMessage("Generating voice summary...");
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      const res = await fetch("http://localhost:3001/api/voice-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          place: {
            id: place.id,
            name: place.name,
            score: place.score,
            rating: place.rating,
            ratingCount: place.ratingCount,
            tags: place.tags,
          },
          quiz,
          voiceGender: quiz.voiceGender,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = data?.error || "Voice summary failed";
        setError(`Voice: ${msg}`);
        setVoiceStatus("error");
        setVoiceMessage(`Voice failed: ${msg}`);
        throw new Error(msg);
      }
      if (data?.script) {
        setVoiceScript(data.script);
      }
      if (!data?.audioBase64) return;
      const audio = new Audio(`data:audio/mpeg;base64,${data.audioBase64}`);
      audio.play().catch((err) => {
        setError(`Voice: ${err?.message || "Audio playback blocked"}`);
        setVoiceStatus("error");
        setVoiceMessage(`Voice failed: ${err?.message || "Audio playback blocked"}`);
      });
      setVoiceStatus("done");
      setVoiceMessage("Voice summary playing.");
    } catch (e) {
      if (String(e?.name || "").includes("Abort")) {
        setVoiceStatus("error");
        setVoiceMessage("Voice timed out.");
      }
      console.log("[voice] error", e?.message || e);
    }
  };

  if (!quizStarted) {
    return (
      <div className="start-screen">
        <div className="start-card intro">
          <p className="eyebrow">Sustainable Dining Finder</p>
          <h1>Personalize your journey</h1>
          <p className="subtitle">
            We use your preferences to tailor sustainability scores, highlight the right places, and explain why each
            match fits you.
          </p>
          <div className="intro-grid">
            <div className="intro-item">
              <h3>More detail per place</h3>
              <p>Phone, hours, price level, ratings, and editorial summaries where available.</p>
            </div>
            <div className="intro-item">
              <h3>Transparent scoring</h3>
              <p>Every score shows the exact signals that influenced it.</p>
            </div>
            <div className="intro-item">
              <h3>Smarter recommendations</h3>
              <p>Your priorities shift the ranking so the top list feels personal.</p>
            </div>
          </div>
        </div>

        <div className="start-card quiz">
          <h2>Personalization quiz</h2>
          <div className="field">
            <label>Diet preference</label>
            <div className="chips">
              {DIET_OPTIONS.map((diet) => (
                <button
                  key={diet}
                  onClick={() => setQuiz((prev) => ({ ...prev, diet }))}
                  className={diet === quiz.diet ? "chip active" : "chip"}
                >
                  {diet}
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <label>Budget comfort</label>
            <div className="chips">
              {BUDGET_OPTIONS.map((budget) => (
                <button
                  key={budget}
                  onClick={() => setQuiz((prev) => ({ ...prev, budget }))}
                  className={budget === quiz.budget ? "chip active" : "chip"}
                >
                  {budget}
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <label>Sustainability priorities</label>
            <div className="chips">
              {PRIORITIES.map((p) => (
                <button
                  key={p.id}
                  onClick={() => togglePriority(p.id)}
                  className={quiz.priorities.includes(p.id) ? "chip active" : "chip"}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <label>Max distance: {quiz.maxDistanceKm} km</label>
            <input
              type="range"
              min={1}
              max={8}
              value={quiz.maxDistanceKm}
              onChange={(e) => setQuiz((prev) => ({ ...prev, maxDistanceKm: Number(e.target.value) }))}
            />
          </div>
          <div className="field">
            <label>Spoken summaries</label>
            <div className="voice-row">
              <button
                className={quiz.voiceEnabled ? "chip active" : "chip"}
                onClick={() => setQuiz((prev) => ({ ...prev, voiceEnabled: !prev.voiceEnabled }))}
              >
                {quiz.voiceEnabled ? "Enabled" : "Disabled"}
              </button>
              <button
                className={quiz.voiceGender === "female" ? "chip active" : "chip"}
                onClick={() => setQuiz((prev) => ({ ...prev, voiceGender: "female" }))}
                disabled={!quiz.voiceEnabled}
              >
                Female voice
              </button>
              <button
                className={quiz.voiceGender === "male" ? "chip active" : "chip"}
                onClick={() => setQuiz((prev) => ({ ...prev, voiceGender: "male" }))}
                disabled={!quiz.voiceEnabled}
              >
                Male voice
              </button>
            </div>
          </div>
          {!quizReady ? <p className="muted">Select a diet, budget, and at least one priority to continue.</p> : null}
          <button className="cta" disabled={!quizReady} onClick={() => setQuizStarted(true)}>
            Start exploring
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="header">
        <div>
          <p className="eyebrow">Sustainable Dining Finder</p>
          <h1>Waste-Less, Value-More Restaurant Explorer</h1>
          <p className="subtitle">
            Prototype combining social signals, personalization, and sustainability logic to surface the best nearby
            options and explain why.
          </p>
        </div>
        <div className="status">
          <span>{loading ? "Scanning map..." : "Live map"}</span>
          {error ? <span className="error">{error}</span> : null}
          {quiz.voiceEnabled && voiceStatus !== "idle" ? (
            <span className={voiceStatus === "error" ? "error" : ""}>{voiceMessage}</span>
          ) : null}
        </div>
      </header>

      <main className="layout">
        <section className="panel">
          <div className="card">
            <h2>Personalization quiz</h2>
            <div className="field">
              <label>Diet preference</label>
              <div className="chips">
                {DIET_OPTIONS.map((diet) => (
                  <button
                    key={diet}
                    onClick={() => setQuiz((prev) => ({ ...prev, diet }))}
                    className={diet === quiz.diet ? "chip active" : "chip"}
                  >
                    {diet}
                  </button>
                ))}
              </div>
            </div>
            <div className="field">
              <label>Budget comfort</label>
              <div className="chips">
                {BUDGET_OPTIONS.map((budget) => (
                  <button
                    key={budget}
                    onClick={() => setQuiz((prev) => ({ ...prev, budget }))}
                    className={budget === quiz.budget ? "chip active" : "chip"}
                  >
                    {budget}
                  </button>
                ))}
              </div>
            </div>
            <div className="field">
              <label>Sustainability priorities</label>
              <div className="chips">
                {PRIORITIES.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => togglePriority(p.id)}
                    className={quiz.priorities.includes(p.id) ? "chip active" : "chip"}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="field">
              <label>Max distance: {quiz.maxDistanceKm} km</label>
              <input
                type="range"
                min={1}
                max={8}
                value={quiz.maxDistanceKm}
                onChange={(e) => setQuiz((prev) => ({ ...prev, maxDistanceKm: Number(e.target.value) }))}
              />
            </div>
            <div className="field">
              <label>Spoken summaries</label>
              <div className="voice-row">
                <button
                  className={quiz.voiceEnabled ? "chip active" : "chip"}
                  onClick={() => setQuiz((prev) => ({ ...prev, voiceEnabled: !prev.voiceEnabled }))}
                >
                  {quiz.voiceEnabled ? "Enabled" : "Disabled"}
                </button>
                <button
                  className={quiz.voiceGender === "female" ? "chip active" : "chip"}
                  onClick={() => setQuiz((prev) => ({ ...prev, voiceGender: "female" }))}
                  disabled={!quiz.voiceEnabled}
                >
                  Female voice
                </button>
                <button
                  className={quiz.voiceGender === "male" ? "chip active" : "chip"}
                  onClick={() => setQuiz((prev) => ({ ...prev, voiceGender: "male" }))}
                  disabled={!quiz.voiceEnabled}
                >
                  Male voice
                </button>
              </div>
            </div>
          </div>

          <div className="card">
            <h2>How we score</h2>
            <ul>
              <li>Social signals from reviews and tags (mocked in prototype).</li>
              <li>Preferences adjust weight toward low waste, plant-forward menus, and value.</li>
              <li>Transparency shows the reasons behind every score.</li>
            </ul>
          </div>
        </section>

        <section className="map-wrap">
          <div className="map" ref={mapRef} />
          <div className="legend">
            <div><span className="dot high" /> High sustainability</div>
            <div><span className="dot mid" /> Medium sustainability</div>
            <div><span className="dot low" /> Lower sustainability</div>
          </div>
        </section>

        <section className="panel results">
          <div className="card">
            <h2>Top sustainable matches</h2>
            {topPlaces.length === 0 ? (
              <p className="muted">No results yet. Try moving the map or adjusting filters.</p>
            ) : (
              topPlaces.map((place) => (
                <div key={place.id} className="result">
                  <div className="result-header">
                    <div>
                      <h3>{place.name}</h3>
                      <p className="score">Score {place.score}/100</p>
                    </div>
                    <span className="pill">{place.tags?.cuisine || "Local favorite"}</span>
                  </div>
                  <div className="result-meta">
                    <span>{formatPriceLevel(place.tags?.priceLevel)}</span>
                    <span>{place.rating ? `Rating ${place.rating}` : "No rating yet"}</span>
                    <span>{place.tags?.openNow === undefined ? "Hours unknown" : place.tags?.openNow ? "Open now" : "Closed now"}</span>
                  </div>
                  <p className="explain">{buildExplanation(place.name, place.score, place.reasons)}</p>
                  <div className="reasons">
                    {place.reasons.map((reason, idx) => (
                      <span key={idx} className="tag">
                        {reason}
                      </span>
                    ))}
                  </div>
                  <div className="comments">
                    {place.comments.map((comment, idx) => (
                      <p key={idx}>"{comment}"</p>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
          <div className="card">
            <h2>Restaurant details</h2>
            {!selectedPlace ? (
              <p className="muted">Click a restaurant on the map to see details.</p>
            ) : (
              <div className="details">
                <div className="result-header">
                  <div>
                    <h3>{selectedPlace.name}</h3>
                    <p className="score">Score {selectedPlace.score}/100</p>
                  </div>
                  <span className="pill">{selectedPlace.tags?.cuisine || "Restaurant"}</span>
                </div>
                <p className="explain">{buildExplanation(selectedPlace.name, selectedPlace.score, selectedPlace.reasons)}</p>
                {selectedPlace.tags?.summary ? <p className="summary">"{selectedPlace.tags.summary}"</p> : null}
                <div className="reasons">
                  {selectedPlace.reasons.map((reason, idx) => (
                    <span key={idx} className="tag">
                      {reason}
                    </span>
                  ))}
                </div>
                <div className="comments">
                  {selectedPlace.comments.map((comment, idx) => (
                    <p key={idx}>"{comment}"</p>
                  ))}
                </div>
                <div className="meta">
                  <div><strong>Address:</strong> {selectedPlace.tags?.address || "Not listed"}</div>
                  <div><strong>Phone:</strong> {selectedPlace.tags?.phone || "Not listed"}</div>
                  <div><strong>Rating:</strong> {selectedPlace.rating ?? "N/A"} ({selectedPlace.ratingCount ?? "N/A"} reviews)</div>
                  <div><strong>Price level:</strong> {formatPriceLevel(selectedPlace.tags?.priceLevel)}</div>
                  <div>
                    <strong>Open now:</strong>{" "}
                    {selectedPlace.tags?.openNow === undefined
                      ? "Hours unknown"
                      : selectedPlace.tags?.openNow
                        ? "Yes"
                        : "No"}
                  </div>
                </div>
                {voiceScript ? (
                  <div className="summary">
                    <strong>Gemini report:</strong>
                    <div>{voiceScript}</div>
                  </div>
                ) : null}
                <div className="youtube">
                  <button
                    className="chip"
                    onClick={async () => {
                      try {
                        setYoutubeStatus("loading");
                        const r = await fetch(
                          `http://localhost:3001/api/youtube/search?q=${encodeURIComponent(selectedPlace.name)}`
                        );
                        const data = await r.json();
                        setYoutubeResults(data.items || []);
                        setYoutubeStatus("done");
                      } catch {
                        setYoutubeStatus("error");
                      }
                    }}
                  >
                    Find YouTube mentions
                  </button>
                  {youtubeStatus === "loading" ? <p className="muted">Loading YouTube results...</p> : null}
                  {youtubeResults.length ? (
                    <ul className="youtube-list">
                      {youtubeResults.map((item) => (
                        <li key={item.id?.videoId}>
                          {item.snippet?.title}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;

