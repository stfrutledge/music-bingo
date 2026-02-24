# Music Bingo Host

A mobile-first Progressive Web App (PWA) for hosting music bingo events. Features two modes:

- **Admin Mode**: Create playlists, generate bingo cards, export PDFs
- **Host Mode**: Run games from your phone with offline support

## Features

- **Offline Support**: Download audio files for fully offline gameplay
- **Card Generation**: Automatically generates balanced bingo cards
- **PDF Export**: Print physical bingo cards in A5 landscape format
- **Winner Verification**: Quickly verify winning cards during the game
- **Wake Lock**: Screen stays on during gameplay
- **PWA**: Install as an app on your phone or tablet

## Quick Start

### Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

### Creating a Playlist

1. Go to Admin mode
2. Click "Create New Playlist"
3. Enter playlist name and description
4. Add songs (manually or bulk paste)
5. Save the playlist

### Generating Cards

1. In Admin mode, click "Cards" on your playlist
2. Configure card count and overlap settings
3. Click "Generate Cards"
4. Download the PDF for printing

### Hosting a Game

1. From the home screen, tap "Start New Game"
2. Select your playlist
3. Download audio files (for offline play)
4. Choose patterns for each round
5. Start playing!

## Audio Files

Audio files should be hosted at a URL accessible to the app. The default location is:

```
https://yourusername.github.io/music-bingo/packs/[playlist-name]/audio/
```

### How Audio Playback Works

- Songs play **from a start time** (skipping slow intros/buildups)
- Songs **continue playing** until the host manually advances to the next song
- This allows flexibility for longer or shorter gaps between songs

### Detecting Start Times

Use the included Python script to analyze your songs and find the best starting points (typically the chorus or most recognizable section):

```bash
# Install dependencies
pip install librosa numpy

# Analyze audio files and generate playlist with start times
python scripts/detect_start_times.py "./my_songs" --output playlist.json
```

The script analyzes energy, rhythm, and spectral features to find each song's most recognizable section.

## Project Structure

```
music-bingo/
├── public/
│   ├── packs/              # Playlist data and audio
│   │   └── sample-2000s/
│   │       ├── playlist.json
│   │       └── audio/*.mp3
│   └── icons/              # PWA icons
├── src/
│   ├── components/
│   │   ├── admin/          # Admin mode UI
│   │   ├── host/           # Host mode UI
│   │   └── shared/         # Reusable components
│   ├── context/            # React context (game state)
│   ├── hooks/              # Custom React hooks
│   ├── lib/                # Core logic
│   │   ├── db.ts           # IndexedDB operations
│   │   ├── cardGenerator.ts
│   │   ├── pdfGenerator.ts
│   │   ├── patterns.ts
│   │   ├── audioCache.ts
│   │   └── winChecker.ts
│   └── types/              # TypeScript types
└── scripts/
    ├── detect_start_times.py  # Analyze songs to find optimal start points
    └── trim_clips.py          # (Optional) Trim songs to clips if needed
```

## Deployment

### GitHub Pages

1. Update `vite.config.ts` base to match your repo:
   ```ts
   base: '/music-bingo/'
   ```

2. Build and deploy:
   ```bash
   npm run build
   # Deploy dist/ folder to gh-pages branch
   ```

### Custom Domain

1. Build the project: `npm run build`
2. Upload `dist/` folder to your web server
3. Ensure HTTPS is enabled for PWA features

## Bingo Patterns

The app includes 10 patterns:

1. **Single Line (Horizontal)** - Any row
2. **Single Line (Vertical)** - Any column
3. **Single Line (Diagonal)** - Either diagonal
4. **Four Corners** - All corner squares
5. **Letter X** - Both diagonals
6. **Plus Sign** - Center row and column
7. **Frame** - Outer border
8. **Letter T** - Top row and center column
9. **Blackout** - All squares
10. **Postage Stamp** - Any 2x2 corner

## Tech Stack

- **React 18** + TypeScript
- **Vite** + vite-plugin-pwa
- **Tailwind CSS**
- **Dexie.js** (IndexedDB)
- **jsPDF** (PDF generation)
- **React Router v6**

## License

MIT
