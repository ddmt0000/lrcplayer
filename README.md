# LRC Lyric Player

A visual lyric player built with React and Bun, featuring multiple lyric display modes with smooth animations and interactive controls.

## Features

### Lyric Display Modes

| Mode | Description |
|------|-------------|
| **Random Tile** | Lyrics randomly placed across the screen with collision avoidance. Supports focus tracking and blur. |
| **Word Cloud** | Spiral layout with current lyric centered. Supports centering toggle and blur. |
| **Nebula** | Small lyrics cluster at center, large lyrics spread to edges. Supports edge tracking and blur. |
| **Vertical List** | Traditional vertical scrolling layout. Supports focus tracking and blur. |

### Screenshots
![RandomTile](./assets/screenshots/RandomTile.png)
![WordCloud](./assets/screenshots/WordCloud.png)
![Nebula](./assets/screenshots/Nebula.png)
![List](./assets/screenshots/List.png)

### Player Controls

- Play / Pause / Previous / Next
- Progress bar with seek
- Loop modes: Single / List / Shuffle
- Playlist panel
- Volume control
- Fullscreen toggle

### Interactive Features

- Click lyrics to seek to that timestamp
- Mouse wheel to adjust font size
- Drag to pan the lyric view
- Auto-hide player in fullscreen mode (3s idle)
- Background color animation synced to playback

## Getting Started

### Prerequisites

- [Bun](https://bun.sh) (v1.0+)

### Installation

```bash
bun install
```

### Development

```bash
bun run index.ts
```

Open http://localhost:3000 in your browser.

### Project Structure

```
lrc/
├── index.html          # Entry HTML
├── index.ts            # Bun server (static hosting + API)
├── app.mjs             # React frontend (all components)
├── styles.css          # Styles
├── assets/
│   ├── music/          # MP3 files
│   └── lrc/            # LRC lyric files
└── package.json
```

### Adding Music

Place `.mp3` files in `assets/music/` and corresponding `.lrc` files in `assets/lrc/`. Files with the same name (excluding extension) will be matched automatically.

## Tech Stack

- **Runtime**: Bun
- **Frontend**: React 18 (via ESM import)
- **Styling**: Plain CSS
- **Server**: Bun.serve() static hosting

## License

MIT
