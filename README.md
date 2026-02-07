# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) (or [oxc](https://oxc.rs) when used in [rolldown-vite](https://vite.dev/guide/rolldown)) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.

---

## Location fetcher (Python)

`fetch_locations.py` fetches restaurants within **1 mile** of a given point using the Google Places API, then writes filtered results to a JSON file.

**Filters:** rating (score) &gt; 2.5 stars, more than 10 Google reviews. Review text is not fetched or stored—only the score and count.

**Output (per restaurant):** name, location (lat/lng + address), rating, number of Google reviews.

### Setup

1. Get a [Google Places API key](https://console.cloud.google.com/google/maps-apis/) and enable **Places API** (and **Maps Places API** if using the new endpoint).
2. Create a `.env` file in the project root with:
   ```
   GOOGLE_PLACES_API_KEY=your-api-key
   ```
3. Install dependencies: `pip install -r requirements.txt`

### Usage

Run with latitude and longitude as numbers (no angle brackets). **Use negative longitude for places west of Greenwich** (e.g. Toronto, North America). Optional: `-o` path for the output file.

```bash
python fetch_locations.py 43.6561 -79.3803
python fetch_locations.py 43.6561 -79.3803 -o output.json
```

More examples:

```bash
python fetch_locations.py 37.7749 -122.4194 -o locations.json
python fetch_locations.py 43.6561 -79.3803 --min-reviews 5
```

Output is written to `locations.json` (or the path given with `-o`).
