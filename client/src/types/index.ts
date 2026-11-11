export interface VideoQuality {
  id: string;
  height: number;
  label: string;
  videoFormatId: string;
  muxed: boolean;
  videoSizeBytes: number | null;
}

export interface AudioTrack {
  id: string;
  language: string | null;
  label: string;
  isOriginal: boolean;
  sizeBytes: number | null;
}

export interface VideoInfo {
  id: string;
  title: string;
  channel: string;
  duration: number;
  thumbnail: string;
  url: string;
  qualities: VideoQuality[];
  audioTracks: AudioTrack[];
}

export interface TranscriptMeta {
  language: string;
  languageCode: string;
  translatedBy: 'youtube' | 'ai' | null;
  isGenerated: boolean;
  originalLanguage: string | null;
  originalLanguageCode: string | null;
  translationFailed?: boolean;
}

export type PrepStage = 'transcript' | 'translating' | 'indexing' | 'ready' | 'no_transcript' | 'error';

export interface PrepStatus {
  stage: PrepStage;
  progress: number | null;
  hasTranscript: boolean;
  chatReady: boolean;
  transcript: TranscriptMeta | null;
  error: string | null;
}

export interface TranscriptSegment {
  text: string;
  start: number;
  duration: number;
}

export interface TranscriptData {
  segments: TranscriptSegment[];
  original: TranscriptSegment[] | null;
  meta: TranscriptMeta;
}

export interface SummaryData {
  summary: string;
  keyPoints: string[];
  chapters: { start: number; title: string }[];
  questions: string[];
}

export interface ChatSource {
  start: number;
  text: string;
}

export interface ChatMessage {
  id?: number | string;
  role: 'user' | 'assistant';
  content: string;
  sources?: ChatSource[];
  pending?: boolean;
  error?: boolean;
}

export type DownloadStatus = 'queued' | 'downloading' | 'processing' | 'completed' | 'failed' | 'cancelled';

export interface DownloadJob {
  id: string;
  videoId: string;
  title: string;
  qualityId: string;
  audioTrackId: string;
  embedSubtitles: boolean;
  status: DownloadStatus;
  phase: string | null;
  progress: number;
  speedBps: number | null;
  etaSeconds: number | null;
  fileName: string | null;
  fileSize: number | null;
  error: string | null;
}

export interface RecentVideo {
  id: string;
  title: string;
  channel: string;
  duration: number;
  viewedAt: number;
}
