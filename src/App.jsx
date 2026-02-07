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

const pickRandom = (arr, count = 2) => {
  const copy = [...arr];
  const out = [];
  while (copy.length && out.length < count) {
    const idx = Math.floor(Math.random() * copy.length);
    out.push(copy.splice(idx, 1)[0]);
  }
  return out;
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

  const [quiz, setQuiz] = useState({
    diet: "Any",
    budget: "$$",
    priorities: ["waste", "value"],
    maxDistanceKm: 3,
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
    if (!mapRef.current || mapInstanceRef.current) return;
    const map = L.map(mapRef.current, { zoomControl: false }).setView(DEFAULT_CENTER, 13);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors",
    }).addTo(map);
    L.control.zoom({ position: "bottomright" }).addTo(map);
    mapInstanceRef.current = map;
    setMapReady(true);
  }, []);

  const fetchPlaces = async () => {
    const map = mapInstanceRef.current;
    if (!map) return;
    setLoading(true);
    setError("");

    const bounds = map.getBounds();
    const bbox = [
      bounds.getSouth(),
      bounds.getWest(),
      bounds.getNorth(),
      bounds.getEast(),
    ].join(",");

    const query = `
      [out:json][timeout:25];
      (
        node["amenity"="restaurant"](${bbox});
      );
      out tags center 60;
    `;

    try {
      const res = await fetch("https://overpass-api.de/api/interpreter", {
        method: "POST",
        body: query,
      });
      if (!res.ok) throw new Error("Failed to reach Overpass API");
      const data = await res.json();
      const formatted = (data.elements || []).map((el) => {
        const tags = el.tags || {};
        const name = tags.name || "Unknown Spot";
        const { score, reasons } = scoreRestaurant(tags, quiz);
        return {
          id: el.id,
          name,
          lat: el.lat,
          lon: el.lon,
          tags,
          score,
          reasons,
          comments: pickRandom(MOCK_COMMENTS, 2),
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

  useEffect(() => {
    if (!mapReady) return;
    fetchPlaces();
  }, [mapReady, quiz.diet, quiz.budget, quiz.priorities.join(","), quiz.maxDistanceKm]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = places.map((place) => {
      const marker = L.marker([place.lat, place.lon]).addTo(map);
      marker.bindPopup(`<strong>${place.name}</strong><br/>Score: ${place.score}/100`);
      marker.on("click", () => setSelectedPlace(place));
      return marker;
    });
  }, [places]);

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
                      <p key={idx}>“{comment}”</p>
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
                <div className="reasons">
                  {selectedPlace.reasons.map((reason, idx) => (
                    <span key={idx} className="tag">
                      {reason}
                    </span>
                  ))}
                </div>
                <div className="comments">
                  {selectedPlace.comments.map((comment, idx) => (
                    <p key={idx}>“{comment}”</p>
                  ))}
                </div>
                <div className="meta">
                  <div><strong>Address:</strong> {selectedPlace.tags?.["addr:full"] || "Not listed"}</div>
                  <div><strong>Phone:</strong> {selectedPlace.tags?.phone || "Not listed"}</div>
                  <div><strong>Website:</strong> {selectedPlace.tags?.website || "Not listed"}</div>
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
