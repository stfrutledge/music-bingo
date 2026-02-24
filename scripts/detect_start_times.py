#!/usr/bin/env python3
"""
Start Time Detector for Music Bingo

This script analyzes audio files to detect the most recognizable section
(typically the chorus) and outputs a JSON file with start times for each song.

The JSON output can be used to populate the startTime field in your playlist.

Requirements:
    pip install librosa numpy

Usage:
    python detect_start_times.py input_folder [--output playlist.json]

Example:
    python detect_start_times.py "./Music Bingo MP3's" --output songs_with_times.json
"""

import argparse
import json
import os
import re
import sys
from pathlib import Path

try:
    import librosa
    import numpy as np
except ImportError:
    print("Missing dependencies. Install with:")
    print("  pip install librosa numpy")
    sys.exit(1)


def detect_best_start_time(audio_path: str, target_duration: float = 45.0) -> tuple[float, float]:
    """
    Analyze audio to find the most recognizable/energetic section.

    Returns:
        tuple: (start_time_seconds, confidence_score)
    """
    try:
        # Load audio for analysis (mono, downsampled for speed)
        y, sr = librosa.load(audio_path, sr=22050, mono=True)
        duration = librosa.get_duration(y=y, sr=sr)

        if duration <= target_duration:
            return 0.0, 0.5  # Song too short, use from start

        # Compute spectral features
        # RMS energy - louder sections are often choruses
        rms = librosa.feature.rms(y=y)[0]

        # Spectral centroid - brighter sections often indicate choruses
        spectral_centroids = librosa.feature.spectral_centroid(y=y, sr=sr)[0]

        # Onset strength - more rhythmic activity
        onset_env = librosa.onset.onset_strength(y=y, sr=sr)

        # Normalize to same length
        min_len = min(len(rms), len(spectral_centroids), len(onset_env))
        rms = rms[:min_len]
        spectral_centroids = spectral_centroids[:min_len]
        onset_env = onset_env[:min_len]

        # Normalize features to 0-1 range
        def normalize(arr):
            arr_min, arr_max = arr.min(), arr.max()
            if arr_max - arr_min < 1e-10:
                return np.zeros_like(arr)
            return (arr - arr_min) / (arr_max - arr_min)

        rms_norm = normalize(rms)
        sc_norm = normalize(spectral_centroids)
        onset_norm = normalize(onset_env)

        # Combine features (weighted average)
        # Higher weight on RMS (energy) and onset (rhythm)
        combined = 0.4 * rms_norm + 0.3 * sc_norm + 0.3 * onset_norm

        # Smooth the signal to avoid picking noisy peaks
        window_size = 10
        combined_smooth = np.convolve(combined, np.ones(window_size)/window_size, mode='same')

        # Convert frame indices to time
        hop_length = 512
        times = librosa.frames_to_time(np.arange(len(combined_smooth)), sr=sr, hop_length=hop_length)

        # Find the best starting point
        # We want a window of ~target_duration that has highest average energy
        window_frames = int(target_duration * sr / hop_length)

        # Skip first 5 seconds (usually intro) and ensure we don't go past song end
        start_frame = int(5 * sr / hop_length)
        end_frame = len(combined_smooth) - window_frames

        if end_frame <= start_frame:
            # Song too short for proper analysis
            return max(0, (duration - target_duration) / 4), 0.5

        best_start = start_frame
        best_score = 0

        for i in range(start_frame, end_frame):
            window_score = np.mean(combined_smooth[i : i + window_frames])
            if window_score > best_score:
                best_score = window_score
                best_start = i

        start_time = times[best_start] if best_start < len(times) else 0

        # Round to nearest second for cleaner values
        start_time = round(start_time)

        # Confidence based on how much better this section is than average
        avg_score = np.mean(combined_smooth)
        confidence = min(1.0, best_score / (avg_score + 0.01))

        return float(start_time), float(confidence)

    except Exception as e:
        print(f"  Warning: Analysis failed ({e}), using fallback")
        return 30.0, 0.3  # Default fallback


def parse_filename(filename: str) -> tuple[str, str]:
    """
    Parse song title and artist from filename.
    Expected format: "Title - Artist.mp3"
    """
    name = Path(filename).stem

    # Try to split by " - "
    parts = name.split(" - ", 1)
    if len(parts) == 2:
        return parts[0].strip(), parts[1].strip()

    # Fallback: whole name as title, unknown artist
    return name, "Unknown Artist"


def generate_song_id(title: str, artist: str) -> str:
    """Generate a URL-safe ID from title and artist."""
    combined = f"{artist}-{title}".lower()
    # Remove special characters, replace spaces with hyphens
    safe_id = re.sub(r'[^a-z0-9]+', '-', combined)
    safe_id = re.sub(r'-+', '-', safe_id).strip('-')
    return safe_id[:50]  # Limit length


def process_folder(input_folder: str, output_file: str) -> dict:
    """
    Process all audio files in a folder and generate playlist JSON.
    """
    input_path = Path(input_folder)

    # Find audio files
    audio_extensions = {".mp3", ".wav", ".flac", ".m4a", ".ogg", ".wma"}
    audio_files = sorted([f for f in input_path.iterdir() if f.suffix.lower() in audio_extensions])

    print(f"\nAnalyzing {len(audio_files)} audio files...")
    print(f"This may take a while for large libraries.\n")

    songs = []

    for i, audio_file in enumerate(audio_files, 1):
        print(f"[{i}/{len(audio_files)}] {audio_file.name}")

        # Parse filename
        title, artist = parse_filename(audio_file.name)

        # Detect start time
        start_time, confidence = detect_best_start_time(str(audio_file))
        print(f"  -> Start at {start_time}s (confidence: {confidence:.0%})")

        song = {
            "id": generate_song_id(title, artist),
            "title": title,
            "artist": artist,
            "audioFile": audio_file.name,
            "startTime": start_time,
            "_confidence": round(confidence, 2),  # For reference, can remove
        }
        songs.append(song)

    # Create playlist structure
    playlist = {
        "id": "generated-playlist",
        "name": "Generated Playlist",
        "description": f"Auto-generated from {input_path.name}",
        "baseAudioUrl": "./audio/",
        "songs": songs,
    }

    # Write output
    output_path = Path(output_file)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(playlist, f, indent=2, ensure_ascii=False)

    print(f"\n{'='*50}")
    print(f"DONE! Processed {len(songs)} songs")
    print(f"Output saved to: {output_path}")
    print(f"\nYou can now import this into the Music Bingo app.")

    return playlist


def main():
    parser = argparse.ArgumentParser(
        description="Detect best start times for music bingo songs"
    )
    parser.add_argument("input_folder", help="Folder containing audio files")
    parser.add_argument(
        "--output", "-o",
        default="playlist_with_times.json",
        help="Output JSON file (default: playlist_with_times.json)",
    )

    args = parser.parse_args()

    if not os.path.isdir(args.input_folder):
        print(f"Error: Input folder does not exist: {args.input_folder}")
        sys.exit(1)

    process_folder(args.input_folder, args.output)


if __name__ == "__main__":
    main()
