import type { FileMeta, MessageType } from '../api/types';
import { useFileBlobUrl } from '../hooks/useFileBlobUrl';
import { formatFileSize } from '../utils/format';

interface MessageAttachmentProps {
  type: MessageType;
  file: FileMeta;
}

export function MessageAttachment({ type, file }: MessageAttachmentProps) {
  const url = useFileBlobUrl(file.id);

  if (!url) {
    return <div className="attachment attachment-loading">Loading {file.fileName}...</div>;
  }

  if (type === 'image') {
    return (
      <a href={url} target="_blank" rel="noreferrer" className="attachment attachment-image">
        <img src={url} alt={file.fileName} />
      </a>
    );
  }

  if (type === 'video') {
    return (
      <video className="attachment attachment-video" src={url} controls>
        Your browser does not support video playback.
      </video>
    );
  }

  if (type === 'audio') {
    return (
      <audio className="attachment attachment-audio" src={url} controls>
        Your browser does not support audio playback.
      </audio>
    );
  }

  return (
    <a href={url} download={file.fileName} className="attachment attachment-file">
      <span className="attachment-file-icon">📎</span>
      <span className="attachment-file-meta">
        <span className="attachment-file-name">{file.fileName}</span>
        <span className="attachment-file-size">{formatFileSize(file.sizeBytes)}</span>
      </span>
    </a>
  );
}
