"use client";

import { useState, useCallback } from "react";
import { Button, Collapse, Drawer, Empty, Input, Spin, Typography, Image, Tag, App } from "antd";
import { EditOutlined } from "@ant-design/icons";
import type { DomainResources, DomainResource, VideoResourceData } from "../types";
import { fetchJson } from "@/app/components/client-utils";
import { ImageDetailDrawer } from "./ImageDetailDrawer";

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

export interface ResourcePanelProps {
  resources: DomainResources | null;
  isLoading: boolean;
  scriptId: string | null;
  sessionId: string | undefined;
  onRefresh?: () => void;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

const ASIDE_CLASS = "flex h-full w-56 min-w-[200px] shrink-0 flex-col border-l border-slate-800 bg-slate-950/80";

export function ResourcePanel({ resources, isLoading, scriptId, sessionId, onRefresh }: ResourcePanelProps) {
  const { message } = App.useApp();

  /* ---- JSON editor drawer state ---- */
  const [editingItem, setEditingItem] = useState<{ id: string; title: string; data: unknown } | null>(null);
  const [editText, setEditText] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  /* ---- Image detail drawer state ---- */
  const [selectedImageGenId, setSelectedImageGenId] = useState<string | null>(null);

  /* ---- Smart image rendering ---- */
  const renderSmartImage = (url: string, alt: string, keyResourceId?: string | null) => {
    if (keyResourceId) {
      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt={alt}
          className="w-full cursor-pointer"
          style={{ display: "block" }}
          onClick={() => setSelectedImageGenId(keyResourceId)}
        />
      );
    }
    return (
      <Image
        src={url}
        alt={alt}
        width="100%"
        style={{ display: "block" }}
      placeholder={<div className="aspect-square w-full bg-slate-800" />}
        preview={true}
      />
    );
  };

  /* ---- JSON editor ---- */
  const openEditor = useCallback((item: { id: string; title: string; data: unknown }) => {
    setEditingItem(item);
    setEditText(item.data != null ? JSON.stringify(item.data, null, 2) : "");
  }, []);

  const handleSave = useCallback(async () => {
    if (!editingItem || !scriptId) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(editText);
    } catch {
      void message.error("Invalid JSON");
      return;
    }
    setIsSaving(true);
    try {
      await fetchJson(`/api/video/episodes/${encodeURIComponent(scriptId)}/resources`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resourceId: editingItem.id, data: parsed }),
      });
      void message.success("Saved");
      setEditingItem(null);
      onRefresh?.();
    } catch {
      void message.error("Save failed");
    } finally {
      setIsSaving(false);
    }
  }, [editingItem, editText, scriptId, onRefresh]);

  /* ---- Per media_type renderers ---- */

  const renderImageItem = (r: DomainResource) => (
    <div key={r.id} className="relative overflow-hidden rounded-lg">
      {r.url ? (
        renderSmartImage(r.url, r.title ?? "Image", r.keyResourceId)
      ) : (
        <div className="flex aspect-square items-center justify-center bg-slate-800">
          <span className="text-xs text-slate-600">No image</span>
        </div>
      )}
      {r.title && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-2 pb-1.5 pt-5">
          <div className="truncate text-center text-[11px] font-medium text-white">{r.title}</div>
        </div>
      )}
    </div>
  );

  const renderVideoItem = (r: DomainResource) => {
    const vData = r.data as VideoResourceData | null;
    return (
      <div key={r.id} className="overflow-hidden rounded-lg">
        {r.url ? (
          <video src={r.url} controls muted className="aspect-[9/16] w-full object-cover" />
        ) : vData?.sourceImageUrl ? (
          <div className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={vData.sourceImageUrl}
              alt={r.title ?? "Source"}
              className="aspect-[9/16] w-full object-cover opacity-50"
            />
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 px-2">
              <span className="mb-1 text-[10px] font-medium text-amber-400">待生成</span>
              {vData.prompt && (
                <p className="line-clamp-3 text-center text-[10px] leading-relaxed text-white/80">
                  {vData.prompt}
                </p>
              )}
            </div>
          </div>
        ) : (
          <div className="flex aspect-[9/16] flex-col items-center justify-center bg-slate-800 px-2">
            <span className="mb-1 text-[10px] font-medium text-amber-400">待生成</span>
            {vData?.prompt ? (
              <p className="line-clamp-4 text-center text-[10px] leading-relaxed text-slate-500">
                {vData.prompt}
              </p>
            ) : (
              <span className="text-xs text-slate-600">No prompt</span>
            )}
          </div>
        )}
        {r.title && (
          <div className="px-2 py-1 text-center text-[11px] text-slate-400">{r.title}</div>
        )}
      </div>
    );
  };

  const renderJsonItem = (r: DomainResource) => {
    const text = r.data != null
      ? (typeof r.data === "string" ? r.data : JSON.stringify(r.data, null, 2))
      : "";
    return (
      <div
        key={r.id}
        className="relative cursor-pointer overflow-hidden rounded-lg bg-slate-900"
        onClick={() => openEditor({ id: r.id, title: r.title ?? "JSON", data: r.data })}
        title="Click to edit"
      >
        <pre className="max-h-32 overflow-hidden whitespace-pre-wrap break-all px-2 pt-2 pb-8 font-mono text-[9px] leading-relaxed text-slate-400">
          {text}
        </pre>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/50 to-transparent px-2 pb-1.5 pt-6">
          <div className="flex items-center justify-between">
            <div className="truncate text-[11px] font-medium text-white">{r.title ?? "JSON"}</div>
            <EditOutlined className="text-[11px] text-white/70" />
          </div>
        </div>
      </div>
    );
  };

  /* ---- Main render ---- */

  if (isLoading) {
    return (
      <aside className={ASIDE_CLASS}>
        <div className="flex flex-1 items-center justify-center"><Spin size="small" /></div>
      </aside>
    );
  }

  if (!resources) {
    return (
      <aside className={ASIDE_CLASS}>
        <div className="flex flex-1 items-center justify-center text-xs text-slate-500">
          Select an episode
        </div>
      </aside>
    );
  }

  const { categories } = resources;
  const isEmpty = categories.length === 0;

  if (isEmpty) {
    return (
      <aside className={ASIDE_CLASS}>
        <div className="flex flex-1 items-center justify-center">
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No resources yet" />
        </div>
      </aside>
    );
  }

  const items = [
    // Dynamic categories — grouped by LLM-assigned category name
    ...categories.map((g) => {
      const images = g.items.filter((r) => r.mediaType === "image");
      const videos = g.items.filter((r) => r.mediaType === "video");
      const jsons = g.items.filter((r) => r.mediaType === "json");

      return {
        key: `cat-${g.category}`,
        label: (
          <span className="flex items-center gap-1.5 text-xs font-medium">
            {g.category}
            <Tag style={{ fontSize: 10, lineHeight: "16px", margin: 0 }}>{g.items.length}</Tag>
          </span>
        ),
        children: (
          <div className="space-y-2">
            {images.length > 0 && <div className="grid grid-cols-2 gap-2">{images.map(renderImageItem)}</div>}
            {videos.length > 0 && <div className="grid grid-cols-2 gap-2">{videos.map(renderVideoItem)}</div>}
            {jsons.length > 0 && <div className="space-y-2">{jsons.map(renderJsonItem)}</div>}
          </div>
        ),
      };
    }),
  ];

  return (
    <>
      <aside className={ASIDE_CLASS}>
        <div className="border-b border-slate-800 px-3 py-2">
          <Typography.Text strong style={{ fontSize: 12 }}>Resources</Typography.Text>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          <Collapse defaultActiveKey={items.map((i) => i.key)} items={items} size="small" ghost />
        </div>
      </aside>

      <ImageDetailDrawer
        imageGenId={selectedImageGenId}
        onClose={() => setSelectedImageGenId(null)}
        onRefresh={() => onRefresh?.()}
      />

      <Drawer
        title={editingItem?.title ?? "Edit JSON"}
        open={!!editingItem}
        onClose={() => setEditingItem(null)}
        styles={{ wrapper: { width: 520 } }}
        extra={
          <Button type="primary" size="small" onClick={() => void handleSave()} loading={isSaving}>
            Save
          </Button>
        }
      >
        <Input.TextArea
          value={editText}
          onChange={(e) => setEditText(e.target.value)}
          autoSize={{ minRows: 20, maxRows: 40 }}
          style={{ fontFamily: "monospace", fontSize: 12 }}
        />
      </Drawer>
    </>
  );
}
