import { useVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useRef, useState } from "react";
import type { Sentence, Speaker } from "./types";

type Props = {
  sentences: Sentence[];
  speakers: Speaker[];
  selectedIds: Set<string>;
  onToggle: (sentenceId: string) => void;
  loadAudio: (sentenceId: string) => Promise<Blob>;
  onEdit: (sentence: Sentence, text: string) => void;
  onSpeaker: (sentence: Sentence, speakerId: string) => void;
};

export function SentenceTable({ sentences, speakers, selectedIds, onToggle, loadAudio, onEdit, onSpeaker }: Props) {
  const parentRef = useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({ count: sentences.length, getScrollElement: () => parentRef.current, estimateSize: () => 66, overscan: 8 });

  return (
    <div className="table-shell" ref={parentRef}>
      <div className="sentence-head"><span>Select</span><span>Sentence</span><span>Speaker</span><span>Status</span><span>Audio</span></div>
      <div style={{ height: `${rowVirtualizer.getTotalSize()}px`, position: "relative" }}>
        {rowVirtualizer.getVirtualItems().map((virtualRow) => {
          const sentence = sentences[virtualRow.index];
          return (
            <div className="sentence-row" key={sentence.id} data-index={virtualRow.index} ref={rowVirtualizer.measureElement} style={{ transform: `translateY(${virtualRow.start}px)` }}>
              <label className="row-select"><input type="checkbox" checked={selectedIds.has(sentence.id)} onChange={() => onToggle(sentence.id)} /><span className="sequence">{sentence.sequence + 1}</span></label>
              <textarea defaultValue={sentence.text} onBlur={(event) => event.currentTarget.value !== sentence.text && onEdit(sentence, event.currentTarget.value)} />
              <select value={sentence.speaker_id ?? ""} onChange={(event) => onSpeaker(sentence, event.target.value)}>
                <option value="">Unassigned</option>
                {speakers.map((speaker) => <option value={speaker.id} key={speaker.id}>{speaker.name}</option>)}
              </select>
              <span className={`status status-${sentence.status}`}>{sentence.status}</span>
              <AudioPreview sentenceId={sentence.id} loadAudio={loadAudio} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AudioPreview({ sentenceId, loadAudio }: { sentenceId: string; loadAudio: (sentenceId: string) => Promise<Blob> }) {
  const [url, setUrl] = useState("");
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  if (!url) return <button className="ghost listen-button" onClick={() => void loadAudio(sentenceId).then((blob) => setUrl(URL.createObjectURL(blob)))}>Listen</button>;
  return <audio controls preload="none" src={url} />;
}
