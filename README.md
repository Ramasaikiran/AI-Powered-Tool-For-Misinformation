#  AI-Powered Tool for Combating Misinformation
Harnessing advanced AI to help users navigate the digital information landscape with clarity. This tool provides real-time analysis of articles, images, and trending topics to uncover misinformation—empowering users to distinguish fact from fiction.
## 🛠 Getting Started

### Prerequisites
- **Node.js** and **npm** installed

### Setup & Run Locally
```bash
git clone https://github.com/Ramasaikiran/AI-Powered-Tool-For-Misinformation.git
cd AI-Powered-Tool-For-Misinformation

npm install
# Create a .env.local file with your API key:
# GEMINI_API_KEY=your_key_here

npm run dev
````

Open your browser and visit `http://localhost:3000` to interact with the app.

---

## Project Features

* **Article Analysis**: Submit an article URL or text and receive an AI-generated credibility score, analysis, and references.
* **Image Detection**: Upload or drop an image—AI evaluates authenticity and flags signs of manipulation.
* **Trending Feed**: Browse real-time trending misinformation topics and recent fact-checks.
* **Dark / Light Mode Switch**: Seamlessly toggle between a light and dark theme.
* **Easy Sharing**: Generate shareable cards or templates to spread awareness on platforms like WhatsApp and X (Twitter).

---

## Tech Stack & Architecture

* **Frontend**: TypeScript + React, powered by Vite
* **AI Backend**: Integrated with Google Gemini (via `GEMINI_API_KEY`) for natural language and image analysis
* **Routing / Pages**: Organized under `/pages`
* **Reusable Components**: Reside under `/components`
* **API Services**: Located in `/services` for handling Gemini API and client-side logic

---

## Repository Structure

```
AI-Powered-Tool-For-Misinformation/
│
├── components/         # UI components (cards, buttons, modals)
├── pages/              # Page views (Home, Article, Image, Trending)
├── services/           # API wrappers (e.g., Gemini client)
├── .env.local          # Local environment variables (API key)
├── App.tsx             # Main entry point
├── index.tsx           # React app bootstrap
├── constants.tsx       # App constants (e.g., theme config)
├── metadata.json       # Project metadata
├── package.json        # npm dependencies & scripts
├── tsconfig.json       # TypeScript configuration
├── vite.config.ts      # Vite build configuration
└── README.md           # This file

## Roadmap & Future Enhancements
* Replace mock logic with real AI outputs (with Gemini or Vertex AI)
* Implement offline demo mode for hackathons or low-connectivity areas
* Add gamification (badges for users identifying misinformation)
* Multilingual support (e.g., regional Indian languages)
* Community reporting & submission system
* Export infographics / templates for easy sharing
## Contributing
1. Fork the repository
2. Create a feature branch (`feature/xyz`)
3. Develop & commit changes
4. Open a Pull Request for review
