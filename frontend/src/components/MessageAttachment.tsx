import type { FileMeta, MessageType } from '../api/types';
import { useFileBlobUrl } from '../hooks/useFileBlobUrl';
import { formatFileSize } from '../utils/format';

interface MessageAttachmentProps {
  type: MessageType;
  file: FileMeta;
  onOpen?: (file: FileMeta, type: MessageType) => void;
}

export function MessageAttachment({ type, file, onOpen }: MessageAttachmentProps) {
  const previewUrl = useFileBlobUrl(file.id, file.hasThumbnail ? 'thumbnail' : 'original');

  if (type === 'image') {
    if (!previewUrl) {
      return <div className="attachment attachment-loading">Loading {file.fileName}...</div>;
    }
    return (
      <button type="button" className="attachment attachment-image" onClick={() => onOpen?.(file, type)}>
        <img src={previewUrl} alt={file.fileName} />
      </button>
    );
  }

  if (type === 'video') {
    if (!previewUrl) {
      return <div className="attachment attachment-loading">Loading {file.fileName}...</div>;
    }
    return (
      <button type="button" className="attachment attachment-video" onClick={() => onOpen?.(file, type)}>
        <video src={previewUrl} preload="metadata" muted />
        <span className="attachment-play-icon">▶</span>
      </button>
    );
  }

  if (type === 'audio') {
    if (!previewUrl) {
      return <div className="attachment attachment-loading">Loading {file.fileName}...</div>;
    }
    return (
      <audio className="attachment attachment-audio" src={previewUrl} controls>
        Your browser does not support audio playback.
      </audio>
    );
  }

  if (!previewUrl) {
    return <div className="attachment attachment-loading">Loading {file.fileName}...</div>;
  }

  return (
    <a href={previewUrl} download={file.fileName} className="attachment attachment-file">
      <span className="attachment-file-icon">📎</span>
      <span className="attachment-file-meta">
        <span className="attachment-file-name">{file.fileName}</span>
        <span className="attachment-file-size">{formatFileSize(file.sizeBytes)}</span>
      </span>
    </a>
  );
}
