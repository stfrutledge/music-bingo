#!/usr/bin/env python3
"""
Audio Clip Trimmer for Music Bingo

This script processes audio files to extract ~45-second clips from the most
recognizable part of each song (typically the chorus). It uses audio analysis
to detect high-energy sections that are likely to be the chorus.

Requirements:
    pip install librosa pydub numpy

Usage:
    python trim_clips.py input_folder output_folder [--duration 45] [--fade 2]

Example:
    python trim_clips.py ./full_songs ./clips --duration 45 --fade 2
"""

import argparse
import os
import sys
from pathlib import Path

try:
    import librosa
    import numpy as np
    from pydub import AudioSegment
except ImportError:
    print("Missing dependencies. Install with:")
    print("  pip install librosa pydub numpy")
    sys.exit(1)


def find_chorus_start(audio_path: str, clip_duration: float = 45.0) -> tuple[float, float]:
    """
    Analyze audio to find the most likely chorus section.

    Returns:
        tuple: (start_time_seconds, confidence_score)
    """
    try:
        # Load audio for analysis
        y, sr = librosa.load(audio_path, sr=22050, mono=True)
        duration = librosa.get_duration(y=y, sr=sr)

        if duration <= clip_duration:
            return 0.0, 0.5  # Song too short, use from start

        # Compute spectral features
        # RMS energy - louder sections are often choruses
        rms = librosa.feature.rms(y=y)[0]

        # Spectral centroid - brighter sections often indicate choruses
        spectral_centroids = librosa.feature.spectral_centroid(y=y, sr=sr)[0]

        # Normalize features
        rms_norm = (rms - rms.min()) / (rms.max() - rms.min() + 1e-10)
        sc_norm = (spectral_centroids - spectral_centroids.min()) / (
            spectral_centroids.max() - spectral_centroids.min() + 1e-10
        )

        # Combine features (weighted average)
        combined = 0.6 * rms_norm + 0.4 * sc_norm

        # Convert frame indices to time
        hop_length = 512
        times = librosa.frames_to_time(np.arange(len(combined)), sr=sr, hop_length=hop_length)

        # Find the best window for our clip duration
        window_frames = int(clip_duration * sr / hop_length)
        best_start = 0
        best_score = 0

        # Skip first and last 10 seconds (usually intro/outro)
        start_frame = int(10 * sr / hop_length)
        end_frame = len(combined) - window_frames - int(10 * sr / hop_length)

        if end_frame <= start_frame:
            # Song too short for proper analysis
            return max(0, (duration - clip_duration) / 3), 0.5

        for i in range(start_frame, end_frame):
            window_score = np.mean(combined[i : i + window_frames])
            if window_score > best_score:
                best_score = window_score
                best_start = i

        start_time = times[best_start] if best_start < len(times) else 0
        confidence = min(1.0, best_score * 1.5)  # Scale confidence

        return start_time, confidence

    except Exception as e:
        print(f"  Warning: Analysis failed ({e}), using fallback position")
        # Fallback: start at 1/3 of the song
        try:
            audio = AudioSegment.from_file(audio_path)
            duration = len(audio) / 1000
            return max(0, (duration - clip_duration) / 3), 0.3
        except Exception:
            return 30.0, 0.1  # Default fallback


def trim_audio(
    input_path: str,
    output_path: str,
    start_time: float,
    duration: float = 45.0,
    fade_duration: float = 2.0,
) -> bool:
    """
    Trim audio file and apply fade in/out.

    Returns:
        bool: True if successful
    """
    try:
        audio = AudioSegment.from_file(input_path)

        start_ms = int(start_time * 1000)
        end_ms = int((start_time + duration) * 1000)

        # Ensure we don't exceed audio length
        if end_ms > len(audio):
            end_ms = len(audio)
            start_ms = max(0, end_ms - int(duration * 1000))

        # Extract clip
        clip = audio[start_ms:end_ms]

        # Apply fades
        fade_ms = int(fade_duration * 1000)
        clip = clip.fade_in(fade_ms).fade_out(fade_ms)

        # Export
        clip.export(output_path, format="mp3", bitrate="192k")
        return True

    except Exception as e:
        print(f"  Error trimming: {e}")
        return False


def process_folder(
    input_folder: str,
    output_folder: str,
    duration: float = 45.0,
    fade: float = 2.0,
) -> dict:
    """
    Process all audio files in a folder.

    Returns:
        dict: Results summary
    """
    input_path = Path(input_folder)
    output_path = Path(output_folder)

    # Create output folder
    output_path.mkdir(parents=True, exist_ok=True)

    # Find audio files
    audio_extensions = {".mp3", ".wav", ".flac", ".m4a", ".ogg", ".wma"}
    audio_files = [f for f in input_path.iterdir() if f.suffix.lower() in audio_extensions]

    results = {
        "processed": 0,
        "failed": 0,
        "skipped": 0,
        "details": [],
    }

    print(f"\nProcessing {len(audio_files)} audio files...")
    print(f"Output folder: {output_path}\n")

    for i, audio_file in enumerate(sorted(audio_files), 1):
        output_file = output_path / f"{audio_file.stem}.mp3"

        print(f"[{i}/{len(audio_files)}] {audio_file.name}")

        # Skip if output exists
        if output_file.exists():
            print("  Skipped (already exists)")
            results["skipped"] += 1
            continue

        # Find chorus
        start_time, confidence = find_chorus_start(str(audio_file), duration)
        print(f"  Detected chorus at {start_time:.1f}s (confidence: {confidence:.0%})")

        # Trim
        if trim_audio(str(audio_file), str(output_file), start_time, duration, fade):
            print(f"  Saved to {output_file.name}")
            results["processed"] += 1
            results["details"].append(
                {
                    "file": audio_file.name,
                    "start": start_time,
                    "confidence": confidence,
                    "status": "success",
                }
            )
        else:
            results["failed"] += 1
            results["details"].append(
                {
                    "file": audio_file.name,
                    "status": "failed",
                }
            )

    return results


def main():
    parser = argparse.ArgumentParser(
        description="Trim audio files to ~45-second clips from the chorus section"
    )
    parser.add_argument("input_folder", help="Folder containing full-length audio files")
    parser.add_argument("output_folder", help="Folder to save trimmed clips")
    parser.add_argument(
        "--duration",
        type=float,
        default=45.0,
        help="Clip duration in seconds (default: 45)",
    )
    parser.add_argument(
        "--fade",
        type=float,
        default=2.0,
        help="Fade in/out duration in seconds (default: 2)",
    )

    args = parser.parse_args()

    if not os.path.isdir(args.input_folder):
        print(f"Error: Input folder does not exist: {args.input_folder}")
        sys.exit(1)

    results = process_folder(
        args.input_folder,
        args.output_folder,
        args.duration,
        args.fade,
    )

    # Print summary
    print("\n" + "=" * 50)
    print("SUMMARY")
    print("=" * 50)
    print(f"Processed: {results['processed']}")
    print(f"Failed:    {results['failed']}")
    print(f"Skipped:   {results['skipped']}")

    # Generate report
    report_path = Path(args.output_folder) / "trim_report.txt"
    with open(report_path, "w") as f:
        f.write("Audio Trim Report\n")
        f.write("=" * 50 + "\n\n")
        for detail in results["details"]:
            if detail["status"] == "success":
                f.write(
                    f"{detail['file']}: {detail['start']:.1f}s "
                    f"(confidence: {detail['confidence']:.0%})\n"
                )
            else:
                f.write(f"{detail['file']}: FAILED\n")

    print(f"\nReport saved to: {report_path}")


if __name__ == "__main__":
    main()
