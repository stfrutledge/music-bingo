#!/usr/bin/env node
/**
 * Loudness normalizer for Music Bingo packs.
 *
 * Clips come from mixed sources (rips at 128k, purchases at 320k, different
 * mastering eras), so their playback level varies wildly - the nmy-vesta pack
 * spanned 15.3 dB before this was written. Mid-game that means the room drops
 * out on a quiet track while the host is already at max volume.
 *
 * Nothing else in the stack fixes this: AudioContext plays every track at a
 * flat volume of 1.0, the files carry no ReplayGain tags, and trim_clips.py
 * has no loudnorm step. So we bake the correction into the files themselves.
 *
 * Two details that matter:
 *
 * 1. Loudness is measured over the WINDOW THE GUESTS ACTUALLY HEAR - the clip
 *    starting at each song's startTime - not the whole file. A song with a
 *    quiet intro and a loud chorus gets a completely different reading each
 *    way, and only the clip's level is audible in the room.
 *
 * 2. The default target is -9 LUFS, not the -14 broadcast/Spotify standard.
 *    These libraries already sit near -9, and -14 would make the whole night
 *    quieter. Raise the target (towards 0) only if you also gain a limiter.
 *
 * Originals are always backed up before anything is written. Run with
 * --dry-run first to see the gains without touching a file.
 *
 * Every file this writes gets an MBNORM tag recording the target it was hit
 * with, and files already carrying that tag are skipped on later runs. Without
 * that, re-running would re-encode the whole pack chasing the ~1-2 dB the
 * limiter leaves behind - inaudible, but a fresh lossy generation every time.
 * Use --force to normalize regardless.
 *
 * Requires ffmpeg + ffprobe on PATH (winget install Gyan.FFmpeg).
 *
 * Usage:
 *   node scripts/normalize_loudness.mjs <pack-id|path/to/playlist.json> [options]
 *
 * Options:
 *   --dry-run          measure and report only; write nothing
 *   --target <LUFS>    integrated loudness target (default -9)
 *   --window <sec>     seconds measured from startTime (default 30)
 *   --backup <dir>     where originals go (default alongside the audio dir)
 *   --jobs <n>         parallel ffmpeg processes (default 4)
 *   --force            re-normalize even files already tagged at this target
 *   --mark             only stamp the MBNORM tag (no re-encode) - for a pack
 *                      that was already levelled by hand or by an older run
 *   --yes              skip the confirmation prompt
 *
 * Examples:
 *   node scripts/normalize_loudness.mjs nmy-vesta --dry-run
 *   node scripts/normalize_loudness.mjs hen-party --target -9
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createInterface } from 'node:readline';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const run = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const DEFAULTS = {
  target: -9,      // LUFS; see header for why this is not -14
  window: 30,      // must track SONG_CLIP_SECONDS in RoundEnd.tsx
  jobs: 4,
  minGain: 0.5,    // below this a re-encode costs more (another lossy pass) than it gains
  truePeak: -1,    // dBTP ceiling the limiter enforces
  tag: 'MBNORM',   // records the target a file was normalized to, so re-runs can skip it
  minBitrate: 192, // don't re-encode a boosted 128k rip back down to 128k
  maxBitrate: 320,
};

function parseArgs(argv) {
  const opts = { ...DEFAULTS, dryRun: false, yes: false, force: false, mark: false, backup: null, pack: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') opts.dryRun = true;
    else if (a === '--yes' || a === '-y') opts.yes = true;
    else if (a === '--force') opts.force = true;
    else if (a === '--mark') opts.mark = true;
    else if (a === '--target') opts.target = parseFloat(argv[++i]);
    else if (a === '--window') opts.window = parseFloat(argv[++i]);
    else if (a === '--jobs') opts.jobs = parseInt(argv[++i], 10);
    else if (a === '--backup') opts.backup = argv[++i];
    else if (a === '--help' || a === '-h') opts.help = true;
    else if (!a.startsWith('-')) opts.pack = a;
  }
  return opts;
}

function usage() {
  console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8')
    .split('\n').filter(l => /^\s*(\*|\/\*\*)/.test(l))
    .map(l => l.replace(/^\s*(\/\*\*|\*\/|\*)\s?/, '')).join('\n').trim());
}

async function which(bin) {
  try {
    await run(bin, ['-version'], { maxBuffer: 1 << 20 });
    return bin;
  } catch {
    // winget installs land here but need a shell restart to reach PATH
    const shim = `C:/Users/${process.env.USERNAME}/AppData/Local/Microsoft/WinGet/Links/${bin}.exe`;
    if (fs.existsSync(shim)) return shim;
    return null;
  }
}

/**
 * Map a playlist's baseAudioUrl to the folder its mp3s live in.
 * "/audio/"            -> public/audio          (shared pool)
 * "./audio/<id>/"      -> public/packs/<id>/audio
 * "https://..."        -> not on this disk
 */
function resolveAudioDir(playlist, playlistPath) {
  const base = playlist.baseAudioUrl || '';
  if (/^https?:\/\//i.test(base)) return { remote: true, dir: base };
  if (base.startsWith('/')) return { remote: false, dir: path.join(ROOT, 'public', base.replace(/^\/+/, '')) };
  return { remote: false, dir: path.resolve(path.dirname(playlistPath), base) };
}

function findPlaylist(pack) {
  const direct = path.resolve(pack);
  if (fs.existsSync(direct) && fs.statSync(direct).isFile()) return direct;
  const byId = path.join(ROOT, 'public', 'packs', pack, 'playlist.json');
  if (fs.existsSync(byId)) return byId;
  return null;
}

/** Integrated loudness + true peak of the clip window, via loudnorm's analysis pass. */
async function measure(ff, file, startTime, window) {
  const { stderr } = await run(ff, [
    '-hide_banner', '-nostats',
    '-ss', String(startTime ?? 0), '-t', String(window),
    '-i', file,
    '-af', 'loudnorm=I=-14:TP=-1:LRA=11:print_format=json',
    '-f', 'null', '-',
  ], { maxBuffer: 1 << 26 });
  const m = stderr.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('no loudnorm output');
  const j = JSON.parse(m[0]);
  const i = parseFloat(j.input_i);
  if (!isFinite(i)) throw new Error(`unusable reading (${j.input_i})`);
  return { i, tp: parseFloat(j.input_tp), lra: parseFloat(j.input_lra) };
}

async function bitrateOf(fp, file) {
  try {
    const { stdout } = await run(fp, ['-v', 'error', '-select_streams', 'a:0',
      '-show_entries', 'stream=bit_rate', '-of', 'default=nw=1:nk=1', file]);
    const kb = Math.round(parseInt(stdout.trim(), 10) / 1000);
    return isFinite(kb) && kb > 0 ? kb : DEFAULTS.minBitrate;
  } catch { return DEFAULTS.minBitrate; }
}

/** The target this file was last normalized to, or null if it never was. */
async function normTagOf(fp, file) {
  try {
    const { stdout } = await run(fp, ['-v', 'error', '-show_entries', 'format_tags', '-of', 'json', file]);
    const tags = JSON.parse(stdout).format?.tags || {};
    const key = Object.keys(tags).find(k => k.toUpperCase() === DEFAULTS.tag);
    return key ? parseFloat(tags[key]) : null;
  } catch { return null; }
}

async function durationOf(fp, file) {
  const { stdout } = await run(fp, ['-v', 'error', '-show_entries', 'format=duration',
    '-of', 'default=nw=1:nk=1', file]);
  return parseFloat(stdout.trim());
}

/** OneDrive holds transient locks on files it is syncing; retry rather than fail the run. */
function copyWithRetry(src, dst, attempts = 5) {
  for (let a = 0; a < attempts; a++) {
    try { fs.copyFileSync(src, dst); return true; }
    catch (e) {
      if (a === attempts - 1) throw e;
      const until = Date.now() + 400;
      while (Date.now() < until) { /* brief spin; sleep would need async plumbing here */ }
    }
  }
  return false;
}

async function pool(items, jobs, worker) {
  const queue = [...items];
  const out = [];
  await Promise.all(Array.from({ length: Math.max(1, jobs) }, async () => {
    while (queue.length) out.push(await worker(queue.shift()));
  }));
  return out;
}

function stats(values) {
  const s = [...values].sort((a, b) => a - b);
  return { min: s[0], median: s[Math.floor(s.length / 2)], max: s[s.length - 1], spread: s[s.length - 1] - s[0] };
}

function confirm(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(res => rl.question(question, a => { rl.close(); res(/^y(es)?$/i.test(a.trim())); }));
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help || !opts.pack) { usage(); process.exit(opts.pack ? 0 : 1); }

  const ff = await which('ffmpeg');
  const fp = await which('ffprobe');
  if (!ff || !fp) {
    console.error('ffmpeg/ffprobe not found. Install with:  winget install Gyan.FFmpeg');
    process.exit(1);
  }

  const playlistPath = findPlaylist(opts.pack);
  if (!playlistPath) {
    console.error(`No playlist found for "${opts.pack}" (tried it as a path and as public/packs/<id>/playlist.json)`);
    process.exit(1);
  }
  const playlist = JSON.parse(fs.readFileSync(playlistPath, 'utf8'));
  const { remote, dir: audioDir } = resolveAudioDir(playlist, playlistPath);
  if (remote) {
    console.error(`This pack streams from ${audioDir}\nDownload the mp3s locally and point baseAudioUrl at them before normalizing.`);
    process.exit(1);
  }
  if (!fs.existsSync(audioDir)) {
    console.error(`Audio folder not found: ${audioDir}`);
    process.exit(1);
  }

  const songs = playlist.songs || [];
  const missing = songs.filter(s => !fs.existsSync(path.join(audioDir, s.audioFile)));
  console.log(`pack:    ${playlist.name || playlist.id}  (${songs.length} songs)`);
  console.log(`audio:   ${audioDir}`);
  console.log(`target:  ${opts.target} LUFS, true peak ${opts.truePeak} dBTP, measured over ${opts.window}s from each startTime`);
  if (missing.length) {
    console.log(`\n${missing.length} file(s) missing from disk - they will be skipped:`);
    missing.slice(0, 10).forEach(s => console.log(`   ${s.audioFile}`));
  }
  const work = songs.filter(s => fs.existsSync(path.join(audioDir, s.audioFile)));
  if (!work.length) { console.error('\nNothing to do.'); process.exit(1); }
  if (songs.some(s => s.startTime == null)) {
    console.log('\nNote: some songs have no startTime; measuring those from 0s.');
    console.log('Run detect_start_times.py first for a reading of the clip that actually plays.');
  }

  console.log(`\nMeasuring ${work.length} clips...`);
  let n = 0;
  const measured = await pool(work, opts.jobs, async s => {
    const file = path.join(audioDir, s.audioFile);
    try {
      const [m, tagged] = await Promise.all([
        measure(ff, file, s.startTime, opts.window),
        normTagOf(fp, file),
      ]);
      if (++n % 25 === 0) process.stderr.write(`  ${n}/${work.length}\n`);
      return { song: s, file, tagged, ...m };
    } catch (e) {
      if (++n % 25 === 0) process.stderr.write(`  ${n}/${work.length}\n`);
      return { song: s, file, err: e.message.slice(0, 60) };
    }
  });

  const ok = measured.filter(r => !r.err);
  const failed = measured.filter(r => r.err);
  if (failed.length) {
    console.log(`\n${failed.length} could not be measured:`);
    failed.forEach(r => console.log(`   ${r.song.title}: ${r.err}`));
  }
  if (!ok.length) { console.error('\nNothing measurable.'); process.exit(1); }

  const before = stats(ok.map(r => r.i));
  console.log(`\nBEFORE   quietest ${before.min.toFixed(1)}   median ${before.median.toFixed(1)}   loudest ${before.max.toFixed(1)} LUFS`);
  console.log(`         spread ${before.spread.toFixed(1)} dB`);

  const plan = ok.map(r => ({ ...r, gain: opts.target - r.i }))
    .sort((a, b) => Math.abs(b.gain) - Math.abs(a.gain));
  const alreadyDone = opts.force ? [] : plan.filter(r => r.tagged === opts.target);
  const toChange = plan.filter(r => Math.abs(r.gain) >= opts.minGain && !alreadyDone.includes(r));
  const toSkip = plan.length - toChange.length;

  if (alreadyDone.length) {
    console.log(`\n${alreadyDone.length} file(s) already carry ${DEFAULTS.tag}=${opts.target}; leaving them alone.`);
    console.log('   (their residual gain is limiter overhead - chasing it just costs another lossy pass. --force overrides.)');
  }
  console.log(`\n${toChange.length} file(s) need adjusting, ${toSkip} skipped.`);
  if (toChange.length) {
    console.log('\nbiggest corrections:');
    toChange.slice(0, 8).forEach(r =>
      console.log(`   ${r.gain > 0 ? '+' : ''}${r.gain.toFixed(1)} dB  ${r.i.toFixed(1)} LUFS  ${r.song.title} - ${r.song.artist || ''}`));
  }

  if (opts.dryRun) {
    console.log('\n--dry-run: nothing written.');
    return;
  }

  // --mark: record that this pack is already levelled, without touching audio.
  // Needed for packs normalized before the tag existed - re-encoding those to
  // chase a fraction of a dB would degrade files that already sound right.
  if (opts.mark) {
    const untagged = plan.filter(r => r.tagged !== opts.target);
    if (!untagged.length) { console.log(`\nAll files already carry ${DEFAULTS.tag}=${opts.target}.`); return; }
    const off = untagged.filter(r => Math.abs(r.gain) >= 2);
    if (off.length) {
      console.log(`\nWarning: ${off.length} file(s) are 2 dB or more off ${opts.target} LUFS.`);
      off.slice(0, 5).forEach(r => console.log(`   ${r.i.toFixed(1)} LUFS  ${r.song.title}`));
      console.log('Marking them claims they are levelled when they are not - normalize instead.');
    }
    if (!opts.yes && !await confirm(`\nStamp ${DEFAULTS.tag}=${opts.target} on ${untagged.length} file(s)? (no re-encode) [y/N] `)) {
      console.log('Aborted.'); return;
    }
    let marked = 0;
    const markTmp = path.join(audioDir, '.mark-tmp');
    fs.mkdirSync(markTmp, { recursive: true });
    await pool(untagged, opts.jobs, async r => {
      const tmp = path.join(markTmp, r.song.audioFile);
      try {
        // -c copy rewrites tags only; the audio stream is bit-identical
        await run(ff, ['-hide_banner', '-loglevel', 'error', '-i', r.file, '-c', 'copy',
          '-map_metadata', '0', '-metadata', `${DEFAULTS.tag}=${opts.target}`, '-y', tmp],
          { maxBuffer: 1 << 26 });
        copyWithRetry(tmp, r.file);
        fs.unlinkSync(tmp);
        marked++;
      } catch (e) { console.log(`   FAILED ${r.song.title}: ${e.message.slice(0, 50)}`); }
    });
    try { fs.rmSync(markTmp, { recursive: true, force: true }); } catch { /* harmless */ }
    console.log(`\nmarked ${marked} file(s) as ${DEFAULTS.tag}=${opts.target} (audio untouched)`);
    return;
  }
  if (!toChange.length) {
    console.log('\nNothing to do - this pack is already level.');
    return;
  }

  // Back up BEFORE writing anything. A boost of +10 dB on a low-bitrate rip can
  // surface encoding artifacts, and that is only ever judged by ear afterwards -
  // so the originals have to still exist when that judgement happens.
  const stamp = new Date().toISOString().slice(0, 10);
  const backupDir = opts.backup || path.join(path.dirname(audioDir), `${path.basename(audioDir)}-backup-${stamp}`);
  console.log(`\nbacking up ${toChange.length} original(s) -> ${backupDir}`);
  fs.mkdirSync(backupDir, { recursive: true });
  for (const r of toChange) {
    const dst = path.join(backupDir, r.song.audioFile);
    if (!fs.existsSync(dst)) copyWithRetry(r.file, dst);
  }

  if (!opts.yes) {
    const go = await confirm(`\nRewrite ${toChange.length} file(s) in place? [y/N] `);
    if (!go) { console.log('Aborted. Backup left in place.'); return; }
  }

  const tmpDir = path.join(backupDir, '.tmp');
  fs.mkdirSync(tmpDir, { recursive: true });
  console.log('');
  let done = 0;
  const results = await pool(toChange, opts.jobs, async r => {
    const origBr = await bitrateOf(fp, r.file);
    const br = Math.min(DEFAULTS.maxBitrate, Math.max(origBr, DEFAULTS.minBitrate));
    const tmp = path.join(tmpDir, r.song.audioFile);
    const limit = Math.pow(10, opts.truePeak / 20).toFixed(3); // dBTP -> linear for alimiter
    try {
      await run(ff, ['-hide_banner', '-loglevel', 'error', '-i', r.file,
        '-af', `volume=${r.gain.toFixed(2)}dB,alimiter=limit=${limit}:level=false`,
        '-c:a', 'libmp3lame', '-b:a', `${br}k`, '-map_metadata', '0',
        '-metadata', `${DEFAULTS.tag}=${opts.target}`, '-y', tmp],
        { maxBuffer: 1 << 26 });
      copyWithRetry(tmp, r.file);
      fs.unlinkSync(tmp);
      process.stderr.write(`  [${++done}/${toChange.length}] ${r.gain > 0 ? '+' : ''}${r.gain.toFixed(1)}dB ${origBr}->${br}k  ${r.song.title}\n`);
      return { ...r, ok: true };
    } catch (e) {
      process.stderr.write(`  [${++done}/${toChange.length}] FAILED ${r.song.title}: ${e.message.slice(0, 50)}\n`);
      return { ...r, err: e.message.slice(0, 80) };
    }
  });
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* leftovers are harmless */ }

  const wrote = results.filter(r => r.ok);
  const broke = results.filter(r => r.err);

  // Verify: a full decode catches truncation a spot-check would miss, and the
  // duration check catches a re-encode that would push startTime past the end.
  console.log(`\nverifying ${wrote.length} rewritten file(s)...`);
  const problems = [];
  await pool(wrote, opts.jobs, async r => {
    try {
      const { stderr } = await run(ff, ['-v', 'error', '-i', r.file, '-f', 'null', '-'], { maxBuffer: 1 << 26 });
      if (stderr.trim()) problems.push(`${r.song.title}: ${stderr.trim().slice(0, 60)}`);
      const [dNew, dOld] = await Promise.all([
        durationOf(fp, r.file),
        durationOf(fp, path.join(backupDir, r.song.audioFile)),
      ]);
      if (Math.abs(dNew - dOld) > 0.5) problems.push(`${r.song.title}: duration ${dOld.toFixed(1)}s -> ${dNew.toFixed(1)}s`);
      if ((r.song.startTime ?? 0) + opts.window > dNew + 0.5)
        problems.push(`${r.song.title}: startTime ${r.song.startTime}+${opts.window}s exceeds ${dNew.toFixed(1)}s`);
    } catch (e) { problems.push(`${r.song.title}: ${e.message.slice(0, 60)}`); }
  });

  const after = await pool(wrote, opts.jobs, async r => {
    try { return (await measure(ff, r.file, r.song.startTime, opts.window)).i; } catch { return null; }
  });
  const unchanged = plan.filter(r => Math.abs(r.gain) < opts.minGain).map(r => r.i);
  const finals = [...after.filter(v => v != null), ...unchanged];

  console.log('');
  if (finals.length) {
    const a = stats(finals);
    console.log(`AFTER    quietest ${a.min.toFixed(1)}   median ${a.median.toFixed(1)}   loudest ${a.max.toFixed(1)} LUFS`);
    console.log(`         spread ${a.spread.toFixed(1)} dB   (was ${before.spread.toFixed(1)} dB)`);
  }
  console.log(`\nrewrote ${wrote.length}, skipped ${toSkip}, failed ${broke.length}`);
  broke.forEach(r => console.log(`   FAILED ${r.song.title}: ${r.err}`));
  if (problems.length) {
    console.log(`\n${problems.length} VERIFICATION PROBLEM(S):`);
    problems.forEach(p => console.log(`   ${p}`));
  } else if (wrote.length) {
    console.log('verification clean - no corruption, no duration drift, all clips still fit');
  }

  console.log(`\noriginals: ${backupDir}`);
  console.log('Listen to the biggest boosts before an event - that is where artifacts show.');
  console.log(`Revert one:  cp "${backupDir}/<file>.mp3" "${audioDir}/"`);
}

main().catch(e => { console.error(e); process.exit(1); });
