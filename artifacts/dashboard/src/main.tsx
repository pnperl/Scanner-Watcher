import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { setBaseUrl } from "@workspace/api-client-react";

// When deploying the frontend separately (e.g. Vercel), set VITE_API_URL
// to point at the API server (e.g. https://your-api.railway.app).
// In same-origin deployments (Railway full-stack), leave it unset.
const apiUrl = import.meta.env.VITE_API_URL as string | undefined;
if (apiUrl) {
  setBaseUrl(apiUrl);
}

createRoot(document.getElementById("root")!).render(<App />);
