"use client";

import { useState, useCallback } from "react";
import { Button, Drawer, Empty, Spin } from "antd";
import { FileTextOutlined } from "@ant-design/icons";
import { fetchJson } from "@/app/components/client-utils";
import type { DomainResource } from "../types";

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

export interface StoryboardViewProps {
  videos: DomainResource[];
  isLoading: boolean;
  scriptKey: string | null;
  /** Episode DB id — needed to fetch content */
  episodeId: string | null;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function StoryboardView({ videos, isLoading, scriptKey, episodeId }: StoryboardViewProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [epContent, setEpContent] = useState<string | null>(null);
  const [loadingContent, setLoadingContent] = useState(false);

  const openEpContent = useCallback(async () => {
    if (!episodeId) return;
    setDrawerOpen(true);
    if (epContent !== null) return;
    setLoadingContent(true);
    try {
      const res = await fetchJson<{ content: string | null }>(
        `/api/video/episodes/${encodeURIComponent(episodeId)}/content`,
      );
      setEpContent(res.content ?? "(empty)");
    } catch {
      setEpContent("Failed to load EP content");
    } finally {
      setLoadingContent(false);
    }
  }, [episodeId, epContent]);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spin description="Loading…" />
      </div>
    );
  }

  if (!scriptKey || videos.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No videos yet" />
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-4">
      {/* EP content button */}
      <div className="flex justify-center py-3">
        <Button
          icon={<FileTextOutlined />}
          onClick={() => void openEpContent()}
          block
        >
          View EP Content
        </Button>
      </div>

      <Drawer
        title="EP Content"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        styles={{ wrapper: { width: 520 } }}
      >
        {loadingContent ? (
          <div className="flex justify-center py-8"><Spin /></div>
        ) : (
          <pre className="whitespace-pre-wrap text-sm leading-relaxed">{epContent}</pre>
        )}
      </Drawer>

      <div className="grid grid-cols-2 gap-3">
        {videos.map((v) => (
          <div
            key={v.id}
            className="overflow-hidden rounded-lg border border-slate-800 bg-slate-900/50"
          >
            {v.url ? (
              <video
                src={v.url}
                controls
                muted
                className="aspect-[9/16] w-full object-cover"
              />
            ) : (
              <div className="flex aspect-[9/16] w-full items-center justify-center bg-slate-800">
                <span className="text-xs text-slate-500">No URL</span>
              </div>
            )}
            {v.title && (
              <div className="px-2 py-1 text-center text-[11px] text-slate-400">
                {v.title}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
