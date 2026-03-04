"use client";

import { useCallback } from "react";
import { Button, Input, Select, Alert } from "antd";
import {
  SendOutlined,
  StopOutlined,
  LoadingOutlined,
  PictureOutlined,
  CloseCircleFilled,
} from "@ant-design/icons";
import { StatusBadge } from "@/app/components/StatusBadge";
import { MessageList } from "@/app/components/MessageList";
import { useImageUpload } from "@/app/components/hooks/useImageUpload";
import { useModels } from "@/app/components/hooks/useModels";
import { useVideoChat } from "../hooks/useVideoChat";
import type { VideoContext } from "../types";

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

export interface VideoChatProps {
  /** undefined = new session */
  initialSessionId: string | undefined;
  videoContext: VideoContext | null;
  preloadMcps: string[];
  skills: string[];
  onSessionCreated: (sessionId: string) => void;
  /** Called when task completes — parent should refresh data. */
  onRefreshNeeded: () => void;
  /** If set, auto-send this message on mount (e.g. after EP upload). */
  autoMessage?: string;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function VideoChat({
  initialSessionId,
  videoContext,
  preloadMcps,
  skills,
  onSessionCreated,
  onRefreshNeeded,
  autoMessage,
}: VideoChatProps) {
  const userName = videoContext
    ? `video:${videoContext.novelId}:${videoContext.scriptKey}`
    : "video:unknown";

  const { models, selectedModel, setSelectedModel } = useModels();

  const chat = useVideoChat(
    initialSessionId,
    userName,
    videoContext,
    preloadMcps,
    skills,
    onSessionCreated,
    onRefreshNeeded,
    autoMessage,
    selectedModel,
  );

  const imageUpload = useImageUpload((msg) => chat.setError(msg));
  const {
    pendingImages,
    setPendingImages,
    isDragOver,
    setIsDragOver,
    isComposing,
    setIsComposing,
    handleImageFiles,
    fileInputRef,
  } = imageUpload;

  const handleSend = useCallback(() => {
    const images = pendingImages.length > 0 ? [...pendingImages] : undefined;
    setPendingImages([]);
    void chat.sendMessage(images);
  }, [chat, pendingImages, setPendingImages]);

  if (!videoContext) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-slate-400">
        Select an episode to start chatting
      </div>
    );
  }

  return (
    <div className="flex h-full bg-white">
      {/* Chat column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2">
          <div className="flex items-center gap-1.5 text-[11px]">
            <span className="rounded-full bg-blue-50 px-2 py-0.5 text-blue-700">
              Style Setup
            </span>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">
              Storyboard
            </span>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">
              Render
            </span>
          </div>
        </div>
        {/* Chat error */}
        {chat.error && (
          <Alert
            type="error"
            message={chat.error}
            showIcon
            closable
            onClose={() => chat.setError(null)}
            style={{ margin: "4px 8px 0" }}
            banner
          />
        )}

        {/* Messages */}
        <div className="flex min-h-0 flex-1 flex-col">
          <MessageList
            messages={chat.messages}
            isLoadingSession={chat.isLoadingSession}
            error={null}
            streamingReply={chat.streamingReply}
            streamingTools={chat.streamingTools}
          />
        </div>

        {/* Active tool indicator */}
        {chat.activeTool && (
          <div className="flex items-center gap-2 border-t border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] text-slate-600">
            <LoadingOutlined className="text-blue-500" />
            <span className="truncate">{chat.activeTool.name}</span>
            <span className="shrink-0 text-slate-400">
              {chat.activeTool.index + 1}/{chat.activeTool.total}
            </span>
          </div>
        )}

        {/* Input */}
        <footer className="px-3 py-2.5">
          {/* Pending image previews */}
          {pendingImages.length > 0 && (
            <div className="mb-1.5 flex flex-wrap gap-1.5">
              {pendingImages.map((url, i) => (
                <div key={url} className="group relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={url}
                    alt={`Pending ${i + 1}`}
                    className="h-12 w-12 rounded border border-slate-700 object-cover"
                  />
                  <CloseCircleFilled
                    className="absolute -right-1 -top-1 cursor-pointer text-slate-400 opacity-0 transition group-hover:opacity-100 hover:text-rose-400"
                    style={{ fontSize: 14 }}
                    onClick={() =>
                      setPendingImages((prev) =>
                        prev.filter((_, idx) => idx !== i),
                      )
                    }
                  />
                </div>
              ))}
            </div>
          )}
          <div
            className={`flex items-end gap-2 rounded-xl border bg-white px-3 py-2 transition ${
              isDragOver
                ? "border-emerald-300 bg-emerald-50"
                : "border-slate-200"
            }`}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragOver(true);
            }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragOver(false);
              void handleImageFiles(Array.from(e.dataTransfer.files));
            }}
          >
            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                void handleImageFiles(Array.from(e.target.files ?? []));
                e.target.value = "";
              }}
            />
            <Button
              type="text"
              size="small"
              icon={<PictureOutlined />}
              onClick={() => fileInputRef.current?.click()}
              disabled={chat.isSending}
              className="shrink-0 !text-slate-500 hover:!text-slate-700"
            />
            <Input.TextArea
              autoSize={{ minRows: 1, maxRows: 4 }}
              placeholder={
                isDragOver ? "松开以上传图片…" : "描述目标画风、镜头语言和内容…"
              }
              value={chat.input}
              onChange={(e) => chat.setInput(e.target.value)}
              onKeyDown={(e) => {
                if (isComposing) return;
                const native = e.nativeEvent;
                const composing =
                  typeof native === "object" &&
                  native !== null &&
                  "isComposing" in native &&
                  (native as { isComposing?: boolean }).isComposing === true;
                if (composing) return;
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              onPaste={(e) => {
                const files = Array.from(e.clipboardData.files);
                if (files.some((f) => f.type.startsWith("image/"))) {
                  e.preventDefault();
                  void handleImageFiles(files);
                }
              }}
              onCompositionStart={() => setIsComposing(true)}
              onCompositionEnd={() => setIsComposing(false)}
              disabled={chat.isSending}
              variant="borderless"
              style={{ fontSize: 12 }}
            />
            <div className="flex shrink-0 items-center gap-1.5 pb-0.5">
              {models.length > 1 && (
                <Select
                  size="small"
                  value={selectedModel || undefined}
                  onChange={setSelectedModel}
                  options={models.map((m) => ({ value: m.id, label: m.label }))}
                  style={{ minWidth: 80, fontSize: 11 }}
                  disabled={chat.isSending || chat.isStreaming}
                />
              )}
              <StatusBadge status={chat.status} />
              {chat.isStreaming ? (
                <Button
                  danger
                  type="primary"
                  size="small"
                  icon={<StopOutlined />}
                  onClick={chat.stopStreaming}
                />
              ) : (
                <Button
                  type="primary"
                  size="small"
                  icon={<SendOutlined />}
                  onClick={handleSend}
                  disabled={
                    chat.isSending ||
                    (chat.input.trim().length === 0 &&
                      pendingImages.length === 0)
                  }
                />
              )}
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
