import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { BaseIntegration } from "./types";

const execFileAsync = promisify(execFile);
const POLL_INTERVAL_MS = 3000;

interface SmtcResult {
  isPlaying: boolean;
  title?: string;
  artist?: string;
  thumbnailBase64?: string;
  thumbnailContentType?: string;
}

const SMTC_SCRIPT = `
$ErrorActionPreference = 'Stop'
# Windows PowerShell's default console output encoding is the system's OEM
# codepage (e.g. cp866), not UTF-8 — without this, non-Latin titles/artists
# (Cyrillic, CJK, ...) come back as mojibake once Node decodes stdout as UTF-8.
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation\`1' })[0]
function Await($WinRtTask, $ResultType) {
  $asTask = $asTaskGeneric.MakeGenericMethod($ResultType)
  $netTask = $asTask.Invoke($null, @($WinRtTask))
  $netTask.Wait(-1) | Out-Null
  $netTask.Result
}
[Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager,Windows.Media.Control,ContentType=WindowsRuntime] | Out-Null
[Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties,Windows.Media.Control,ContentType=WindowsRuntime] | Out-Null
[Windows.Storage.Streams.IRandomAccessStreamWithContentType,Windows.Storage.Streams,ContentType=WindowsRuntime] | Out-Null
[Windows.Storage.Streams.DataReader,Windows.Storage.Streams,ContentType=WindowsRuntime] | Out-Null
$manager = Await ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])
$session = $manager.GetCurrentSession()
if ($null -eq $session) {
  '{"isPlaying":false}'
  exit
}
$props = Await ($session.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
$playback = $session.GetPlaybackInfo()
$isPlaying = $playback.PlaybackStatus -eq [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionPlaybackStatus]::Playing

# Thumbnail is a stream reference, not raw bytes — read it fully into memory
# and base64-encode it here so Node gets something it can turn straight into
# a data: URI, same shape as Spotify's album art after nowPlayingCache resolves it.
$thumbnailBase64 = $null
$thumbnailContentType = $null
if ($props.Thumbnail) {
  try {
    $thumbStream = Await ($props.Thumbnail.OpenReadAsync()) ([Windows.Storage.Streams.IRandomAccessStreamWithContentType])
    $size = [uint32]$thumbStream.Size
    if ($size -gt 0) {
      $reader = [Windows.Storage.Streams.DataReader]::CreateDataReader($thumbStream)
      Await ($reader.LoadAsync($size)) ([uint32]) | Out-Null
      $bytes = New-Object byte[] $size
      $reader.ReadBytes($bytes)
      $thumbnailBase64 = [Convert]::ToBase64String($bytes)
      $thumbnailContentType = $thumbStream.ContentType
    }
  } catch {
    # No thumbnail this tick — the dashboard just keeps showing the last known cover.
  }
}

[PSCustomObject]@{
  isPlaying = $isPlaying
  title = $props.Title
  artist = $props.Artist
  thumbnailBase64 = $thumbnailBase64
  thumbnailContentType = $thumbnailContentType
} | ConvertTo-Json -Compress
`.trim();

export class WindowsMediaIntegration extends BaseIntegration {
  private lastKey = "";

  start(): void {
    const enabled = this.config.getSetting<boolean>(
      "windowsMedia.enabled",
      false,
    );
    if (!enabled || process.platform !== "win32") {
      this.setStatus("disconnected");
      return;
    }

    this.setStatus("connected");
    this.startPolling(() => this.poll(), POLL_INTERVAL_MS);
  }

  stop(): void {
    this.stopPolling();
    this.setStatus("disconnected");
  }

  private async poll(): Promise<void> {
    let result: SmtcResult;
    try {
      const { stdout } = await execFileAsync(
        "powershell.exe",
        [
          "-NoProfile",
          "-NonInteractive",
          "-ExecutionPolicy",
          "Bypass",
          "-Command",
          SMTC_SCRIPT,
        ],

        { timeout: 5000, windowsHide: true, maxBuffer: 10 * 1024 * 1024 },
      );
      result = stdout.trim()
        ? (JSON.parse(stdout) as SmtcResult)
        : { isPlaying: false };
    } catch {
      result = { isPlaying: false };
    }

    const title = result.title ?? "";
    const artist = result.artist ?? "";

    if (!title && !artist) return;

    const albumArt =
      result.thumbnailBase64 && result.thumbnailContentType
        ? `data:${result.thumbnailContentType};base64,${result.thumbnailBase64}`
        : undefined;

    const key = `${result.isPlaying}|${title}|${artist}|${albumArt ? "art" : "noart"}`;
    if (key === this.lastKey) return;
    this.lastKey = key;

    this.eventBus.emit("now-playing", {
      source: "windows",
      title,
      artist,
      isPlaying: result.isPlaying,
      albumArt,
    });
  }
}
