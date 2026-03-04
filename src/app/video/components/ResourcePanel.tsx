"use client";

import { useState, useCallback, useRef, useMemo, useEffect } from "react";
import {
  Button,
  Collapse,
  Drawer,
  Empty,
  Input,
  Spin,
  Typography,
  Image,
  Tag,
  App,
} from "antd";
import { DeleteOutlined, EditOutlined } from "@ant-design/icons";
import type {
  DomainResources,
  DomainResource,
  VideoResourceData,
} from "../types";
import { fetchJson } from "@/app/components/client-utils";
import { ImageDetailDrawer } from "./ImageDetailDrawer";
import { VideoDetailDrawer } from "./VideoDetailDrawer";

export interface ResourcePanelProps {
  resources: DomainResources | null;
  isLoading: boolean;
  scriptId: string | null;
  sessionId: string | undefined;
  viewFilter: "all" | "image" | "video" | "json";
  onRefresh?: () => void;
}

const ASIDE_CLASS =
  "flex h-full w-72 min-w-[260px] shrink-0 flex-col border-l border-slate-200 bg-white";

export function ResourcePanel({
  resources,
  isLoading,
  scriptId,
  sessionId,
  viewFilter,
  onRefresh,
}: ResourcePanelProps) {
  const { message } = App.useApp();

  const [editingItem, setEditingItem] = useState<{
    id: string;
    title: string;
    data: unknown;
  } | null>(null);
  const [editText, setEditText] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const [selectedImageGenId, setSelectedImageGenId] = useState<string | null>(
    null,
  );
  const [selectedVideoResource, setSelectedVideoResource] =
    useState<DomainResource | null>(null);

  const [activeKeys, setActiveKeys] = useState<string[]>([]);
  const knownKeysRef = useRef<Set<string>>(new Set());

  const renderSmartImage = (
    url: string,
    alt: string,
    keyResourceId?: string | null,
  ) => {
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
        placeholder={<div className="aspect-square w-full bg-slate-100" />}
        preview={true}
      />
    );
  };

  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());

  const handleDelete = useCallback(
    async (id: string) => {
      if (!scriptId) return;
      setDeletingIds((prev) => new Set(prev).add(id));
      try {
        await fetchJson(
          `/api/video/episodes/${encodeURIComponent(scriptId)}/resources`,
          {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ resourceId: id }),
          },
        );
        void message.success("Deleted");
        onRefresh?.();
      } catch {
        void message.error("Delete failed");
      } finally {
        setDeletingIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    },
    [scriptId, onRefresh, message],
  );

  const openEditor = useCallback(
    (item: { id: string; title: string; data: unknown }) => {
      setEditingItem(item);
      setEditText(item.data != null ? JSON.stringify(item.data, null, 2) : "");
    },
    [],
  );

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
      await fetchJson(
        `/api/video/episodes/${encodeURIComponent(scriptId)}/resources`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ resourceId: editingItem.id, data: parsed }),
        },
      );
      void message.success("Saved");
      setEditingItem(null);
      onRefresh?.();
    } catch {
      void message.error("Save failed");
    } finally {
      setIsSaving(false);
    }
  }, [editingItem, editText, scriptId, onRefresh, message]);

  const renderDeleteBtn = (id: string) => (
    <Button
      type="text"
      size="small"
      danger
      icon={<DeleteOutlined />}
      loading={deletingIds.has(id)}
      className="!absolute right-1 top-1 z-10 opacity-0 transition-opacity group-hover/card:opacity-100 !bg-white/90"
      onClick={(e) => {
        e.stopPropagation();
        void handleDelete(id);
      }}
      style={{ fontSize: 10, width: 22, height: 22, minWidth: 22 }}
    />
  );

  const renderImageItem = (r: DomainResource) => (
    <div
      key={r.id}
      className="group/card relative overflow-hidden rounded-lg border border-slate-200 bg-white"
    >
      {renderDeleteBtn(r.id)}
      {r.url ? (
        renderSmartImage(r.url, r.title ?? "Image", r.keyResourceId)
      ) : (
        <div className="flex aspect-square items-center justify-center bg-slate-100">
          <span className="text-xs text-slate-500">No image</span>
        </div>
      )}
      {r.title && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/50 to-transparent px-2 pb-1.5 pt-5">
          <div className="truncate text-center text-[11px] font-medium text-white">
            {r.title}
          </div>
        </div>
      )}
    </div>
  );

  const renderVideoItem = (r: DomainResource) => {
    const vData = r.data as VideoResourceData | null;
    const handleClick = () => {
      if (r.keyResourceId) {
        setSelectedImageGenId(r.keyResourceId);
      } else {
        setSelectedVideoResource(r);
      }
    };
    return (
      <div
        key={r.id}
        className="group/card relative cursor-pointer overflow-hidden rounded-lg border border-slate-200 bg-white"
        onClick={handleClick}
      >
        {renderDeleteBtn(r.id)}
        {r.url ? (
          <video
            src={r.url}
            controls
            muted
            className="aspect-[9/16] w-full object-cover"
            onClick={(e) => e.stopPropagation()}
          />
        ) : vData?.sourceImageUrl ? (
          <div className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={vData.sourceImageUrl}
              alt={r.title ?? "Source"}
              className="aspect-[9/16] w-full object-cover opacity-60"
            />
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/70 px-2">
              <span className="mb-1 text-[10px] font-medium text-amber-700">
                待生成
              </span>
              {vData.prompt && (
                <p className="line-clamp-3 text-center text-[10px] leading-relaxed text-slate-700">
                  {vData.prompt}
                </p>
              )}
            </div>
          </div>
        ) : (
          <div className="flex aspect-[9/16] flex-col items-center justify-center bg-slate-100 px-2">
            <span className="mb-1 text-[10px] font-medium text-amber-700">
              待生成
            </span>
            {vData?.prompt ? (
              <p className="line-clamp-4 text-center text-[10px] leading-relaxed text-slate-500">
                {vData.prompt}
              </p>
            ) : (
              <span className="text-xs text-slate-500">No prompt</span>
            )}
          </div>
        )}
        {r.title && (
          <div className="px-2 py-1 text-center text-[11px] text-slate-500">
            {r.title}
          </div>
        )}
      </div>
    );
  };

  const renderJsonItem = (r: DomainResource) => {
    const text =
      r.data != null
        ? typeof r.data === "string"
          ? r.data
          : JSON.stringify(r.data, null, 2)
        : "";
    return (
      <div
        key={r.id}
        className="group/card relative cursor-pointer overflow-hidden rounded-lg border border-slate-200 bg-slate-50"
        onClick={() =>
          openEditor({ id: r.id, title: r.title ?? "JSON", data: r.data })
        }
        title="Click to edit"
      >
        {renderDeleteBtn(r.id)}
        <pre className="max-h-32 overflow-hidden whitespace-pre-wrap break-all px-2 pb-8 pt-2 font-mono text-[9px] leading-relaxed text-slate-600">
          {text}
        </pre>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-200/90 via-slate-100/40 to-transparent px-2 pb-1.5 pt-6">
          <div className="flex items-center justify-between">
            <div className="truncate text-[11px] font-medium text-slate-700">
              {r.title ?? "JSON"}
            </div>
            <EditOutlined className="text-[11px] text-slate-600" />
          </div>
        </div>
      </div>
    );
  };

  const categories = useMemo(() => resources?.categories ?? [], [resources]);
  const categoryKeys = useMemo(
    () => categories.map((g) => `cat-${g.category}`),
    [categories],
  );
  useEffect(() => {
    const newKeys = categoryKeys.filter((k) => !knownKeysRef.current.has(k));
    if (newKeys.length > 0) {
      for (const k of newKeys) knownKeysRef.current.add(k);
      setActiveKeys((prev) => [...prev, ...newKeys]);
    }
  }, [categoryKeys]);

  if (isLoading) {
    return (
      <aside className={ASIDE_CLASS}>
        <div className="flex flex-1 items-center justify-center">
          <Spin size="small" />
        </div>
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

  if (categories.length === 0) {
    return (
      <aside className={ASIDE_CLASS}>
        <div className="flex flex-1 items-center justify-center">
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="No resources yet"
          />
        </div>
      </aside>
    );
  }

  const shouldShow = (mediaType: "image" | "video" | "json"): boolean =>
    viewFilter === "all" || viewFilter === mediaType;

  const items = categories.map((g) => {
    const images = g.items.filter((r) => r.mediaType === "image");
    const videos = g.items.filter((r) => r.mediaType === "video");
    const jsons = g.items.filter((r) => r.mediaType === "json");

    return {
      key: `cat-${g.category}`,
      label: (
        <span className="flex items-center gap-1.5 text-xs font-medium text-slate-700">
          {g.category}
          <Tag style={{ fontSize: 10, lineHeight: "16px", margin: 0 }}>
            {g.items.length}
          </Tag>
        </span>
      ),
      children: (
        <div className="space-y-2">
          {shouldShow("image") && images.length > 0 && (
            <div className="grid grid-cols-2 gap-2">
              {images.map(renderImageItem)}
            </div>
          )}
          {shouldShow("video") && videos.length > 0 && (
            <div className="grid grid-cols-2 gap-2">
              {videos.map(renderVideoItem)}
            </div>
          )}
          {shouldShow("json") && jsons.length > 0 && (
            <div className="space-y-2">{jsons.map(renderJsonItem)}</div>
          )}
          {((viewFilter === "image" && images.length === 0) ||
            (viewFilter === "video" && videos.length === 0) ||
            (viewFilter === "json" && jsons.length === 0)) && (
            <div className="rounded border border-dashed border-slate-300 px-3 py-2 text-xs text-slate-400">
              No {viewFilter} assets in this category.
            </div>
          )}
        </div>
      ),
    };
  });

  return (
    <>
      <aside className={ASIDE_CLASS}>
        <div className="border-b border-slate-200 px-3 py-2">
          <div className="flex items-center justify-between">
            <Typography.Text strong style={{ fontSize: 12 }}>
              Resources
            </Typography.Text>
            <Typography.Text type="secondary" style={{ fontSize: 11 }}>
              {sessionId ? "session-linked" : "episode-only"}
            </Typography.Text>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          <Collapse
            activeKey={activeKeys}
            onChange={(keys) => setActiveKeys(keys as string[])}
            items={items}
            size="small"
            ghost
          />
        </div>
      </aside>

      <ImageDetailDrawer
        imageGenId={selectedImageGenId}
        onClose={() => setSelectedImageGenId(null)}
        onRefresh={() => onRefresh?.()}
      />

      <VideoDetailDrawer
        resource={selectedVideoResource}
        onClose={() => setSelectedVideoResource(null)}
      />

      <Drawer
        title={editingItem?.title ?? "Edit JSON"}
        open={!!editingItem}
        onClose={() => setEditingItem(null)}
        styles={{ wrapper: { width: 520 } }}
        extra={
          <Button
            type="primary"
            size="small"
            onClick={() => void handleSave()}
            loading={isSaving}
          >
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
