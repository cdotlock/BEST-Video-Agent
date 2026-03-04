"use client";

import { useRef } from "react";
import { Button, Typography, Empty, Tag } from "antd";
import {
  UploadOutlined,
  ReloadOutlined,
  PlusOutlined,
  DeleteOutlined,
} from "@ant-design/icons";
import type { EpisodeSummary, EpStatus } from "../types";
import type { SessionSummary } from "@/app/types";

const STATUS_CONFIG: Record<EpStatus, { color: string; label: string }> = {
  empty: { color: "default", label: "empty" },
  uploaded: { color: "blue", label: "uploaded" },
  has_resources: { color: "green", label: "active" },
};

function EpStatusTag({ status }: { status: EpStatus }) {
  const cfg = STATUS_CONFIG[status];
  return (
    <Tag
      color={cfg.color}
      style={{ fontSize: 10, lineHeight: "16px", margin: 0 }}
    >
      {cfg.label}
    </Tag>
  );
}

export interface EpisodeListProps {
  novelName: string;
  episodes: EpisodeSummary[];
  isLoading: boolean;
  isUploading: boolean;
  selectedEpisode: EpisodeSummary | null;
  onSelectEpisode: (ep: EpisodeSummary) => void;
  onDeleteEpisode: (ep: EpisodeSummary) => void;
  onRefresh: () => void;
  onUpload: (
    scriptKey: string,
    scriptName: string | null,
    content: string | null,
  ) => void;
  sessions: SessionSummary[];
  currentSessionId: string | undefined;
  onSelectSession: (sessionId: string) => void;
  onNewSession: () => void;
  onDeleteSession: (sessionId: string) => void;
}

export function EpisodeList({
  novelName,
  episodes,
  isLoading,
  isUploading,
  selectedEpisode,
  onSelectEpisode,
  onDeleteEpisode,
  onRefresh,
  onUpload,
  sessions,
  currentSessionId,
  onSelectSession,
  onNewSession,
  onDeleteSession,
}: EpisodeListProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const raw = reader.result;
      if (typeof raw !== "string") {
        return;
      }
      const content = raw;
      const baseName = file.name.replace(/\.[^.]+$/, "");
      const epMatch =
        baseName.match(/(?:EP|ep|Ep)\s*(\d+)/i) ??
        baseName.match(/第\s*(\d+)\s*章/);
      const scriptKey = epMatch ? `EP${epMatch[1]}` : baseName.toUpperCase();
      const scriptName = baseName;

      onUpload(scriptKey, scriptName, content);
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-slate-200 bg-white">
      <div className="border-b border-slate-200 p-3">
        <Typography.Text
          strong
          ellipsis
          style={{ display: "block", fontSize: 14 }}
        >
          {novelName}
        </Typography.Text>
        <Typography.Text type="secondary" style={{ fontSize: 11 }}>
          Episode Management
        </Typography.Text>
        <Button
          size="small"
          icon={<UploadOutlined />}
          onClick={() => fileInputRef.current?.click()}
          loading={isUploading}
          disabled={isUploading}
          block
          style={{ marginTop: 8 }}
        >
          {isUploading ? "Initializing…" : "Upload EP File"}
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".md,.txt"
          onChange={handleFileUpload}
          style={{ display: "none" }}
        />
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        <div className="mb-1 flex items-center justify-between">
          <Typography.Text
            type="secondary"
            style={{
              fontSize: 10,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            Episodes
          </Typography.Text>
          <Button
            type="text"
            size="small"
            icon={<ReloadOutlined />}
            loading={isLoading}
            onClick={onRefresh}
          />
        </div>

        {episodes.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="No episodes"
            style={{ margin: "12px 0" }}
          />
        ) : (
          <div className="space-y-1">
            {episodes.map((ep) => {
              const isActive = selectedEpisode?.id === ep.id;
              return (
                <div key={ep.id} className="group relative">
                  <button
                    type="button"
                    className={`w-full rounded border px-2.5 py-2 text-left transition ${
                      isActive
                        ? "border-blue-300 bg-blue-50"
                        : "border-slate-200 bg-white hover:border-slate-300"
                    }`}
                    onClick={() => onSelectEpisode(ep)}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-slate-800">
                        {ep.scriptKey}
                      </span>
                      <EpStatusTag status={ep.status} />
                    </div>
                    {ep.scriptName && (
                      <div className="mt-0.5 truncate text-[10px] text-slate-500">
                        {ep.scriptName}
                      </div>
                    )}
                  </button>
                  <Button
                    type="text"
                    size="small"
                    danger
                    icon={<DeleteOutlined />}
                    className="!absolute right-0.5 top-0.5 opacity-0 group-hover:opacity-100"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteEpisode(ep);
                    }}
                    style={{ width: 20, height: 20, minWidth: 20 }}
                  />
                </div>
              );
            })}
          </div>
        )}

        {selectedEpisode && (
          <div className="mt-4 border-t border-slate-100 pt-3">
            <div className="mb-1 flex items-center justify-between">
              <Typography.Text
                type="secondary"
                style={{
                  fontSize: 10,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                Sessions
              </Typography.Text>
              <Button
                type="text"
                size="small"
                icon={<PlusOutlined />}
                onClick={onNewSession}
                title="New Chat"
              />
            </div>
            {sessions.length === 0 ? (
              <div className="py-2 text-center text-[10px] text-slate-500">
                No sessions. Click + to start.
              </div>
            ) : (
              <div className="space-y-1">
                {sessions.map((s) => {
                  const isActive = currentSessionId === s.id;
                  return (
                    <div key={s.id} className="group relative">
                      <button
                        type="button"
                        className={`w-full rounded border px-2 py-1 text-left text-[10px] transition ${
                          isActive
                            ? "border-emerald-300 bg-emerald-50"
                            : "border-slate-200 bg-white hover:border-slate-300"
                        }`}
                        onClick={() => onSelectSession(s.id)}
                      >
                        <div className="truncate pr-5 text-slate-700">
                          {s.title?.trim() || "Untitled"}
                        </div>
                      </button>
                      <Button
                        type="text"
                        size="small"
                        danger
                        icon={<DeleteOutlined />}
                        className="!absolute right-0.5 top-0.5 opacity-0 group-hover:opacity-100"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteSession(s.id);
                        }}
                        style={{ width: 20, height: 20, minWidth: 20 }}
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
