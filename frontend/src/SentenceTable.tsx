import { useVirtualizer } from "@tanstack/react-virtual";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import type { Sentence, Speaker } from "./types";
import { Button } from "./shared/ui/Button";
import { Checkbox } from "./shared/ui/Checkbox";
import { Select } from "./shared/ui/Select";
import { StatusBadge } from "./shared/ui/StatusBadge";
import { Textarea } from "./shared/ui/Textarea";

type Props = {
  sentences: Sentence[];
  speakers: Speaker[];
  selectedIds: Set<string>;
  onToggle: (sentenceId: string) => void;
  loadAudio: (sentenceId: string) => Promise<Blob>;
  onEdit: (sentence: Sentence, text: string) => void;
  onSpeaker: (sentence: Sentence, speakerId: string) => void;
};

type TableRow =
  | { kind: "chapter"; key: string; number: number; title: string | null }
  | { kind: "sentence"; sentence: Sentence };

export function SentenceTable({ sentences, speakers, selectedIds, onToggle, loadAudio, onEdit, onSpeaker }: Props) {
  const parentRef = useRef<HTMLDivElement>(null);
  const rows: TableRow[] = [];
  let previousChapterKey = "";
  for (const sentence of sentences) {
    const chapterNumber = sentence.chapter_number || 0;
    const chapterTitle = sentence.chapter_title ?? null;
    const chapterKey = `${chapterNumber}:${chapterTitle ?? ""}`;
    if (chapterNumber > 0 && chapterKey !== previousChapterKey) {
      rows.push({ kind: "chapter", key: chapterKey, number: chapterNumber, title: chapterTitle });
      previousChapterKey = chapterKey;
    }
    rows.push({ kind: "sentence", sentence });
  }
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (index) => rows[index]?.kind === "chapter" ? 38 : 66,
    overscan: 8,
  });

  return (
    <div className="table-shell" ref={parentRef}>
      <div className="sentence-head"><span>Select</span><span>Sentence</span><span>Speaker</span><span>Status</span><span>Audio</span></div>
      <div style={{ height: `${rowVirtualizer.getTotalSize()}px`, position: "relative" }}>
        {rowVirtualizer.getVirtualItems().map((virtualRow) => {
          const row = rows[virtualRow.index];
          if (row.kind === "chapter") {
            return <div className="chapter-row" key={`chapter-${virtualRow.index}-${row.key}`} data-index={virtualRow.index} ref={rowVirtualizer.measureElement} style={{ transform: `translateY(${virtualRow.start}px)` }}><span>Chapter {row.number}</span>{row.title && row.title !== String(row.number) && <strong>{row.title}</strong>}</div>;
          }
          const sentence = row.sentence;
          return (
            <div className="sentence-row" key={sentence.id} data-index={virtualRow.index} ref={rowVirtualizer.measureElement} style={{ transform: `translateY(${virtualRow.start}px)` }}>
              <label className="row-select"><Checkbox checked={selectedIds.has(sentence.id)} onChange={() => onToggle(sentence.id)} aria-label={`Select sentence ${sentence.sequence + 1}`} /><span className="sequence">{sentence.sequence + 1}</span></label>
              <Textarea defaultValue={sentence.text} onBlur={(event) => event.currentTarget.value !== sentence.text && onEdit(sentence, event.currentTarget.value)} />
              <Select value={sentence.speaker_id ?? ""} onChange={(event) => onSpeaker(sentence, event.target.value)}>
                <option value="">Unassigned</option>
                {speakers.map((speaker) => <option value={speaker.id} key={speaker.id}>{speaker.name}</option>)}
              </Select>
              <StatusBadge status={sentence.status}>{sentence.status}</StatusBadge>
              <AudioPreview sentenceId={sentence.id} loadAudio={loadAudio} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AudioPreview({ sentenceId, loadAudio }: { sentenceId: string; loadAudio: (sentenceId: string) => Promise<Blob> }) {
  const audio = useQuery({ queryKey: ["sentence-audio", sentenceId], queryFn: () => loadAudio(sentenceId), enabled: false, staleTime: Infinity });
  const [url, setUrl] = useState("");
  useEffect(() => {
    if (!audio.data) return;
    const nextUrl = URL.createObjectURL(audio.data);
    setUrl(nextUrl);
    return () => URL.revokeObjectURL(nextUrl);
  }, [audio.data]);
  if (!url) return <Button variant="ghost" size="sm" className="listen-button" disabled={audio.isFetching} onClick={() => void audio.refetch()}>{audio.isFetching ? "Loading…" : "Listen"}</Button>;
  return <audio controls preload="none" src={url} />;
}
