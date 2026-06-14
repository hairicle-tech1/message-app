import { useEffect, useState } from 'react';
import * as conversationsApi from '../api/conversations';
import type { ConversationMediaItem, FileMeta, MessageType } from '../api/types';
import { useFileBlobUrl } from '../hooks/useFileBlobUrl';

interface MediaGalleryProps {
  conversationId: string;
  onClose: () => void;
  onOpen: (file: FileMeta, type: MessageType) => void;
}

export function MediaGallery({ conversationId, onClose, onOpen }: MediaGalleryProps) {
  const [media, setMedia] = useState<ConversationMediaItem[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    conversationsApi.getConversationMedia(conversationId).then(({ media }) => {
      if (!cancelled) setMedia(media);
    });
    return () => {
      cancelled = true;
    };
  }, [conversationId]);

  return (
    <div className="gallery-overlay" onClick={onClose}>
      <div className="gallery-panel" onClick={(e) => e.stopPropagation()}>
        <header className="gallery-header">
          <h3>Media</h3>
          <button className="lightbox-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>
        {media === null && <div className="gallery-empty">Loading...</div>}
        {media?.length === 0 && <div className="gallery-empty">No images or videos shared yet.</div>}
        <div className="gallery-grid">
          {media?.map((item) => <GalleryItem key={item.file.id} item={item} onOpen={onOpen} />)}
        </div>
      </div>
    </div>
  );
}

function GalleryItem({
  item,
  onOpen,
}: {
  item: ConversationMediaItem;
  onOpen: (file: FileMeta, type: MessageType) => void;
}) {
  const variant = item.type === 'image' && item.file.hasThumbnail ? 'thumbnail' : 'original';
  const url = useFileBlobUrl(item.file.id, variant);

  return (
    <button type="button" className="gallery-item" onClick={() => onOpen(item.file, item.type)}>
      {!url && <span className="gallery-item-loading">...</span>}
      {url && item.type === 'image' && <img src={url} alt={item.file.fileName} />}
      {url && item.type === 'video' && (
        <>
          <video src={url} preload="metadata" muted />
          <span className="attachment-play-icon">▶</span>
        </>
      )}
    </button>
  );
}
