export interface videoUploadInfo {
  etag: string;
  id: string;
  kind: string;
  snippet: Snippet;
  status: Status;
}

export interface Snippet {
  categoryId: string;
  channelId: string;
  channelTitle: string;
  defaultAudioLanguage: string;
  defaultLanguage: string;
  description: string;
  liveBroadcastContent: string;
  localized: Localized;
  publishedAt: string;
  thumbnails: Thumbnails;
  title: string;
}

export interface Localized {
  description: string;
  title: string;
}

export interface Thumbnails {
  default: Default;
  high: High;
  medium: Medium;
}

export interface Default {
  height: number;
  url: string;
  width: number;
}

export interface High {
  height: number;
  url: string;
  width: number;
}

export interface Medium {
  height: number;
  url: string;
  width: number;
}

export interface Status {
  embeddable: boolean;
  license: string;
  privacyStatus: string;
  publicStatsViewable: boolean;
  uploadStatus: string;
}
