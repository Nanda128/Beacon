# BEACON - Behavioral Engine for Autonomous Coordination in Ocean Navigation

> Final Year Project - B.Sc. Immersive Software Engineering, University of Limerick

BEACON is a browser-based simulation of autonomous drone-swarm maritime search-and-rescue (SAR) operations. 
It models a realistic multi-drone fleet operating over a procedurally generated ocean sector, complete with swarm coordination, sensor detection, communication degradation, and operator alerts, all running entirely client-side with no backend.
---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | React, TypeScript |
| Build | Vite |
| Routing | React Router |
| Animation | Framer Motion |
| Procedural generation | `seedrandom`, `simplex-noise` |
| Styling | Vanilla CSS + Tailwind v4 (CSS custom properties) |
| Rendering | HTML5 Canvas 2D API (custom renderer) |

---

## Getting Started

```powershell
npm install
npm run dev
```

Open the URL printed in the terminal (default: `http://localhost:5173`).

### Other Commands

```powershell
npm run build    # type-check + production build → dist/
npm run preview  # serve the production build locally
npm run clean    # remove dist/, node_modules/, and the lockfile
```

---

## License

See [LICENSE](LICENSE).
