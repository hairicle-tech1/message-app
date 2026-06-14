import type { FileMeta, MessageType } from '../api/types';
import { useFileBlobUrl } from '../hooks/useFileBlobUrl';

interface LightboxProps {
  file: FileMeta;
  type: MessageType;
  onClose: () => void;
}

export function Lightbox({ file, type, onClose }: LightboxProps) {
  const url = useFileBlobUrl(file.id, 'original');

  return (
    <div className="lightbox-overlay" onClick={onClose}>
      <button className="lightbox-close" onClick={onClose} aria-label="Close">
        ✕
      </button>
      <div className="lightbox-content" onClick={(e) => e.stopPropagation()}>
        {!url && <div className="attachment-loading">Loading {file.fileName}...</div>}
        {url && type === 'image' && <img src={url} alt={file.fileName} />}
        {url && type === 'video' && (
          <video src={url} controls autoPlay>
            Your browser does not support video playback.
          </video>
        )}
      </div>
    </div>
  );
}
