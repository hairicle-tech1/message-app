import type { FileMeta, MessageType } from '../api/types';
import { useFileBlobUrl } from '../hooks/useFileBlobUrl';
import { formatFileSize } from '../utils/format';

interface MessageAttachmentProps {
  type: MessageType;
  file: FileMeta;
  isMine?: boolean;
  onOpen?: (file: FileMeta, type: MessageType) => void;
}

export function MessageAttachment({ type, file, isMine, onOpen }: MessageAttachmentProps) {
  const previewUrl = useFileBlobUrl(file.id, file.hasThumbnail ? 'thumbnail' : 'original');
  const loadingClass = isMine ? 'text-indigo-200' : 'text-slate-400';

  if (type === 'image') {
    if (!previewUrl) {
      return <p className={`text-xs italic mb-1 ${loadingClass}`}>Loading {file.fileName}...</p>;
    }
    return (
      <button
        type="button"
        className="block mb-1 rounded-xl overflow-hidden hover:opacity-90 transition-opacity"
        onClick={() => onOpen?.(file, type)}
      >
        <img
          src={previewUrl}
          alt={file.fileName}
          className="block max-w-[220px] max-h-[220px] object-cover"
        />
      </button>
    );
  }

  if (type === 'video') {
    if (!previewUrl) {
      return <p className={`text-xs italic mb-1 ${loadingClass}`}>Loading {file.fileName}...</p>;
    }
    return (
      <button
        type="button"
        className="relative block mb-1 rounded-xl overflow-hidden hover:opacity-90 transition-opacity max-w-[260px]"
        onClick={() => onOpen?.(file, type)}
      >
        <video src={previewUrl} preload="metadata" muted className="block w-full rounded-xl pointer-events-none" />
        <span className="absolute inset-0 flex items-center justify-center">
          <span className="w-10 h-10 rounded-full bg-black/50 flex items-center justify-center text-white text-sm">
            ▶
          </span>
        </span>
      </button>
    );
  }

  if (type === 'audio') {
    if (!previewUrl) {
      return <p className={`text-xs italic mb-1 ${loadingClass}`}>Loading {file.fileName}...</p>;
    }
    return (
      <audio src={previewUrl} controls className="block mb-1 max-w-[220px] w-full">
        Your browser does not support audio playback.
      </audio>
    );
  }

  if (!previewUrl) {
    return <p className={`text-xs italic mb-1 ${loadingClass}`}>Loading {file.fileName}...</p>;
  }

  return (
    <a
      href={previewUrl}
      download={file.fileName}
      className="flex items-center gap-2.5 mb-1 px-3 py-2 rounded-xl bg-black/10 hover:bg-black/15 transition-colors no-underline"
    >
      <span className="text-lg flex-shrink-0">📎</span>
      <span className="flex flex-col min-w-0">
        <span className="text-sm font-semibold truncate max-w-[160px]">{file.fileName}</span>
        <span className="text-xs opacity-70">{formatFileSize(file.sizeBytes)}</span>
      </span>
    </a>
  );
}
