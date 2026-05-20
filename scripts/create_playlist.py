#!/usr/bin/env python3
"""
Create playlist JSON from folder of MP3s, extracting metadata from ID3 tags.

Requirements:
    pip install mutagen

Usage:
    python create_playlist.py "C:\path\to\folder" --name "Playlist Name" --output playlist.json
"""

import argparse
import json
import re
import sys
from pathlib import Path

try:
    from mutagen.easyid3 import EasyID3
    from mutagen.mp3 import MP3
except ImportError:
    print("Missing mutagen. Install with: pip install mutagen")
    sys.exit(1)


def generate_song_id(title: str, artist: str) -> str:
    """Generate a URL-safe ID from title and artist."""
    combined = f"{artist}-{title}".lower()
    safe_id = re.sub(r'[^a-z0-9]+', '-', combined)
    safe_id = re.sub(r'-+', '-', safe_id).strip('-')
    return safe_id[:50]


def create_playlist(input_folder: str, playlist_name: str, output_file: str):
    input_path = Path(input_folder)
    audio_files = sorted(input_path.glob("*.mp3"))

    print(f"Found {len(audio_files)} MP3 files\n")

    songs = []
    for i, audio_file in enumerate(audio_files, 1):
        try:
            audio = MP3(audio_file, ID3=EasyID3)
            title = audio.get('title', [audio_file.stem])[0]
            artist = audio.get('artist', ['Unknown Artist'])[0]
        except Exception as e:
            print(f"  Warning: Could not read tags from {audio_file.name}: {e}")
            title = audio_file.stem
            artist = "Unknown Artist"

        song_id = generate_song_id(title, artist)
        print(f"[{i}] {title} - {artist}")

        songs.append({
            "id": song_id,
            "title": title,
            "artist": artist,
            "audioFile": audio_file.name,
        })

    # Create playlist slug from name
    playlist_id = re.sub(r'[^a-z0-9]+', '-', playlist_name.lower()).strip('-')

    playlist = {
        "id": playlist_id,
        "name": playlist_name,
        "baseAudioUrl": f"./audio/{playlist_id}/",
        "songs": songs,
        "createdAt": int(__import__('time').time() * 1000),
        "updatedAt": int(__import__('time').time() * 1000),
    }

    output_path = Path(output_file)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(playlist, f, indent=2, ensure_ascii=False)

    print(f"\nCreated {output_path} with {len(songs)} songs")


def main():
    parser = argparse.ArgumentParser(description="Create playlist from MP3 folder")
    parser.add_argument("input_folder", help="Folder containing MP3 files")
    parser.add_argument("--name", "-n", required=True, help="Playlist name")
    parser.add_argument("--output", "-o", default="playlist.json", help="Output file")
    args = parser.parse_args()

    create_playlist(args.input_folder, args.name, args.output)


if __name__ == "__main__":
    main()
